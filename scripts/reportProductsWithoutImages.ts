import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

type ProductDoc = {
  id: number | string
  images?: unknown
  published?: boolean | null
  sku?: null | string
  slug?: null | string
  stockQty?: null | number
  title?: null | string
}

const PAGE_SIZE = 500
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const REPORT_PATH = path.join(REPORTS_DIR, 'products-without-images.csv')

const csvEscape = (value: unknown) => {
  const stringValue = value === null || value === undefined ? '' : String(value)

  return `"${stringValue.replace(/"/g, '""')}"`
}

const getPublicURL = (slug?: null | string) => (slug ? `https://nikelectric.eu/product/${slug}` : '')

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rows: Array<{
    id: string
    published: boolean | null
    sku: string
    slug: string
    stockQty: number | null
    title: string
    url: string
  }> = []

  let page = 1
  let processedProducts = 0

  while (true) {
    const result = await payload.find({
      collection: 'products',
      depth: 0,
      limit: PAGE_SIZE,
      overrideAccess: true,
      page,
      pagination: true,
      select: {
        images: true,
        published: true,
        sku: true,
        slug: true,
        stockQty: true,
        title: true,
      },
      sort: 'sku',
    })

    for (const product of result.docs as ProductDoc[]) {
      processedProducts += 1

      if (Array.isArray(product.images) && product.images.length > 0) {
        continue
      }

      rows.push({
        id: String(product.id),
        published: product.published ?? null,
        sku: product.sku || '',
        slug: product.slug || '',
        stockQty: typeof product.stockQty === 'number' ? product.stockQty : null,
        title: product.title || '',
        url: getPublicURL(product.slug),
      })
    }

    if (!result.hasNextPage) {
      break
    }

    page += 1
  }

  const lines = [
    ['sku', 'title', 'id', 'published', 'stockQty', 'slug', 'url'].map(csvEscape).join(','),
    ...rows.map((row) =>
      [
        row.sku,
        row.title,
        row.id,
        row.published === null ? '' : row.published ? 'published' : 'hidden',
        row.stockQty,
        row.slug,
        row.url,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ]

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        processedProducts,
        productsWithoutImages: rows.length,
        publishedWithoutImages: rows.filter((row) => row.published === true).length,
        reportPath: REPORT_PATH,
      },
      null,
      2,
    ),
  )
}

void main()
