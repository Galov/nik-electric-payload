import 'dotenv/config'

import path from 'node:path'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

type ProductImage = {
  alt?: null | string
  legacyUrl?: null | string
  storageKey?: null | string
}

type ProductDoc = {
  id: number | string
  images?: null | ProductImage[]
  slug?: null | string
  title?: null | string
}

const PAGE_SIZE = 100
const LIMIT = Number.parseInt(process.env.R2_MIGRATION_LIMIT || process.argv[2] || '20', 10)
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.R2_FETCH_TIMEOUT_MS || '15000', 10)

const requiredEnv = [
  'R2_ACCESS_KEY_ID',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_SECRET_ACCESS_KEY',
] as const

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Липсва env променлива: ${key}`)
  }
}

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  endpoint: process.env.R2_ENDPOINT!,
  region: process.env.R2_REGION || 'auto',
})

const sanitizePathSegment = (value: null | string | undefined) => {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'product'
}

const getFilenameFromURL = (url: string) => {
  try {
    const parsed = new URL(url)
    const basename = path.posix.basename(parsed.pathname)
    return basename || 'image'
  } catch {
    return 'image'
  }
}

const inferContentType = (url: string, headerValue: null | string) => {
  if (headerValue) return headerValue

  const lower = url.toLowerCase()

  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'

  return 'image/jpeg'
}

const fetchWithTimeout = async (url: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const migrate = async () => {
  const payload = await getPayload({ config: configPromise })

  let migratedImages = 0
  let failedImages = 0
  let processedProducts = 0
  let touchedProducts = 0
  let skippedImages = 0
  let page = 1
  let hasNextPage = true

  while (hasNextPage && migratedImages < LIMIT) {
    const result = await payload.find({
      collection: 'products',
      depth: 0,
      limit: PAGE_SIZE,
      overrideAccess: true,
      page,
      pagination: true,
      select: {
        id: true,
        images: true,
        slug: true,
        title: true,
      },
      sort: 'id',
    })

    for (const rawProduct of result.docs as ProductDoc[]) {
      if (migratedImages >= LIMIT) break

      processedProducts += 1

      const images = Array.isArray(rawProduct.images) ? rawProduct.images : []
      if (!images.length) continue

      let productChanged = false

      const nextImages = [...images]

      for (let index = 0; index < nextImages.length; index += 1) {
        if (migratedImages >= LIMIT) break

        const image = nextImages[index]

        if (!image?.legacyUrl || image.storageKey) {
          skippedImages += 1
          continue
        }

        let response: Response

        try {
          response = await fetchWithTimeout(image.legacyUrl)
        } catch (error) {
          failedImages += 1
          skippedImages += 1
          console.warn(
            `[#${processedProducts}] Пропускам ${image.legacyUrl} за продукт ${rawProduct.id}: ${error instanceof Error ? error.message : 'Неуспешно сваляне'}`,
          )
          continue
        }

        if (!response.ok) {
          failedImages += 1
          console.warn(
            `[#${processedProducts}] Пропускам ${image.legacyUrl} за продукт ${rawProduct.id}: HTTP ${response.status}`,
          )
          skippedImages += 1
          continue
        }

        const contentType = inferContentType(image.legacyUrl, response.headers.get('content-type'))
        const filename = getFilenameFromURL(image.legacyUrl)
        const productSegment = sanitizePathSegment(rawProduct.slug || rawProduct.title)
        const storageKey = `products/${productSegment}/${rawProduct.id}-${index + 1}-${filename}`
        const body = Buffer.from(await response.arrayBuffer())

        await s3.send(
          new PutObjectCommand({
            Body: body,
            Bucket: process.env.R2_BUCKET!,
            ContentType: contentType,
            Key: storageKey,
          }),
        )

        nextImages[index] = {
          ...image,
          storageKey,
        }

        migratedImages += 1
        productChanged = true

        if (migratedImages % 100 === 0) {
          console.log(
            `Прогрес: ${migratedImages}/${LIMIT} снимки, продукт #${processedProducts}, slug=${rawProduct.slug || 'n/a'}`,
          )
        }
      }

      if (!productChanged) continue

      await payload.update({
        id: rawProduct.id,
        collection: 'products',
        data: {
          images: nextImages.map((image) => ({
            alt: image.alt || undefined,
            legacyUrl: image.legacyUrl || '',
            storageKey: image.storageKey || undefined,
          })),
        },
        overrideAccess: true,
      })

      touchedProducts += 1
    }

    hasNextPage = result.hasNextPage
    page += 1
  }

  console.log(
    JSON.stringify(
      {
        limit: LIMIT,
        failedImages,
        migratedImages,
        processedProducts,
        skippedImages,
        touchedProducts,
      },
      null,
      2,
    ),
  )
}

void migrate()
