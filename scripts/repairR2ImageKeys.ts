import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
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
  sku?: null | string
  title?: null | string
}

type Candidate = {
  imageIndex: number
  legacyUrl: string
  nextStorageKey: string
  previousStorageKey: string
}

type ReportItem = {
  candidates?: string[]
  imageIndex: number
  legacyUrl?: string
  nextStorageKey?: string
  previousStorageKey?: string
  productId: string
  sku?: string | null
  title?: string | null
}

const PAGE_SIZE = 250
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const shouldWrite = process.argv.includes('--write')

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

const isSuspiciousStorageKey = (value?: null | string) =>
  typeof value === 'string' && /^products\/\d+\//.test(value)

const getFilenameFromURL = (url: string) => {
  try {
    const parsed = new URL(url)
    return path.posix.basename(parsed.pathname) || ''
  } catch {
    return ''
  }
}

const getFilenameFromStorageKey = (storageKey: string) => path.posix.basename(storageKey)

const listAllR2Keys = async () => {
  const keys: string[] = []
  let continuationToken: string | undefined

  while (true) {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET!,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
        Prefix: 'products/',
      }),
    )

    for (const item of response.Contents || []) {
      if (item.Key) {
        keys.push(item.Key)
      }
    }

    if (!response.IsTruncated || !response.NextContinuationToken) {
      break
    }

    continuationToken = response.NextContinuationToken
  }

  return keys
}

const buildFilenameIndex = (keys: string[]) => {
  const index = new Map<string, string[]>()

  for (const key of keys) {
    const filename = getFilenameFromStorageKey(key)
    if (!filename) continue

    const existing = index.get(filename) || []
    existing.push(key)
    index.set(filename, existing)
  }

  return index
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

const repair = async () => {
  const payload = await getPayload({ config: configPromise })
  const allR2Keys = await listAllR2Keys()
  const filenameIndex = buildFilenameIndex(allR2Keys)

  let page = 1
  let processedProducts = 0
  let suspiciousImages = 0
  let autoFixable = 0
  let updatedProducts = 0

  const autoFixed: ReportItem[] = []
  const ambiguous: ReportItem[] = []
  const notFound: ReportItem[] = []

  while (true) {
    const result = await payload.find({
      collection: 'products',
      depth: 0,
      limit: PAGE_SIZE,
      page,
      pagination: true,
      overrideAccess: true,
      select: {
        images: true,
        sku: true,
        title: true,
      },
      sort: 'id',
    })

    for (const product of result.docs as ProductDoc[]) {
      processedProducts += 1

      const images = Array.isArray(product.images) ? product.images : []
      if (!images.length) continue

      const nextImages = [...images]
      const productCandidates: Candidate[] = []

      images.forEach((image, imageIndex) => {
        if (!isSuspiciousStorageKey(image?.storageKey)) {
          return
        }

        suspiciousImages += 1

        const previousStorageKey = image?.storageKey || ''
        const legacyUrl = image?.legacyUrl || ''
        const filename = getFilenameFromURL(legacyUrl)

        if (!filename) {
          notFound.push({
            imageIndex,
            legacyUrl,
            previousStorageKey,
            productId: String(product.id),
            sku: product.sku,
            title: product.title,
          })
          return
        }

        const candidates = filenameIndex.get(filename) || []

        if (candidates.length === 1) {
          autoFixable += 1
          productCandidates.push({
            imageIndex,
            legacyUrl,
            nextStorageKey: candidates[0] as string,
            previousStorageKey,
          })
          autoFixed.push({
            imageIndex,
            legacyUrl,
            nextStorageKey: candidates[0] as string,
            previousStorageKey,
            productId: String(product.id),
            sku: product.sku,
            title: product.title,
          })
          return
        }

        if (candidates.length > 1) {
          ambiguous.push({
            candidates,
            imageIndex,
            legacyUrl,
            previousStorageKey,
            productId: String(product.id),
            sku: product.sku,
            title: product.title,
          })
          return
        }

        notFound.push({
          imageIndex,
          legacyUrl,
          previousStorageKey,
          productId: String(product.id),
          sku: product.sku,
          title: product.title,
        })
      })

      if (!shouldWrite || productCandidates.length === 0) {
        continue
      }

      for (const candidate of productCandidates) {
        nextImages[candidate.imageIndex] = {
          ...nextImages[candidate.imageIndex],
          storageKey: candidate.nextStorageKey,
        }
      }

      await payload.update({
        id: product.id,
        collection: 'products',
        context: {
          skipIbisProductSync: true,
        },
        data: {
          images: nextImages.map((image) => ({
            alt: image.alt || undefined,
            legacyUrl: image.legacyUrl || '',
            storageKey: image.storageKey || undefined,
          })),
        },
        overrideAccess: true,
      })

      updatedProducts += 1
    }

    if (!result.hasNextPage) {
      break
    }

    page += 1
  }

  const report = {
    ambiguous,
    autoFixed,
    autoFixable,
    mode: shouldWrite ? 'write' : 'dry-run',
    notFound,
    processedProducts,
    suspiciousImages,
    totalR2Objects: allR2Keys.length,
    updatedProducts,
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  const reportPath = path.join(REPORTS_DIR, `repair-r2-image-keys-${timestamp}.json`)
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        ambiguous: ambiguous.length,
        autoFixable,
        mode: shouldWrite ? 'write' : 'dry-run',
        notFound: notFound.length,
        processedProducts,
        reportPath,
        suspiciousImages,
        totalR2Objects: allR2Keys.length,
        updatedProducts,
      },
      null,
      2,
    ),
  )
}

void repair()
