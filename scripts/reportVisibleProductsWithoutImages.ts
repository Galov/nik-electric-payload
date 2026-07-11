import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

type ProductDoc = {
  id: number | string
  images?: unknown
  legacyProductUrl?: null | string
  published?: boolean | null
  sku?: null | string
  slug?: null | string
  stockQty?: null | number
  title?: null | string
}

const PAGE_SIZE = 500
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const REPORT_PATH = path.join(REPORTS_DIR, 'visible-products-without-images.csv')

const csvEscape = (value: unknown) => {
  const stringValue = value === null || value === undefined ? '' : String(value)

  return `"${stringValue.replace(/"/g, '""')}"`
}

const getNewSiteURL = (slug?: null | string) =>
  slug ? `https://nikelectric.com/product/${slug}` : ''

const isQueryProductURL = (value: string) =>
  value.includes('post_type=product') || value.includes('?p=')

const getOldSiteURL = (product: ProductDoc) => {
  if (product.legacyProductUrl && !isQueryProductURL(product.legacyProductUrl)) {
    return product.legacyProductUrl
  }

  if (product.slug) {
    return `https://nikelectric.com/product/${product.slug}/`
  }

  return product.legacyProductUrl || ''
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rows: Array<{
    id: string
    newSiteUrl: string
    oldSiteUrl: string
    sku: string
    stockQty: number
    title: string
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
        legacyProductUrl: true,
        published: true,
        sku: true,
        slug: true,
        stockQty: true,
        title: true,
      },
      sort: 'sku',
      where: {
        and: [
          {
            published: {
              equals: true,
            },
          },
          {
            stockQty: {
              greater_than: 0,
            },
          },
        ],
      },
    })

    for (const product of result.docs as ProductDoc[]) {
      processedProducts += 1

      if (Array.isArray(product.images) && product.images.length > 0) {
        continue
      }

      rows.push({
        id: String(product.id),
        newSiteUrl: getNewSiteURL(product.slug),
        oldSiteUrl: getOldSiteURL(product),
        sku: product.sku || '',
        stockQty: typeof product.stockQty === 'number' ? product.stockQty : 0,
        title: product.title || '',
      })
    }

    if (!result.hasNextPage) {
      break
    }

    page += 1
  }

  const lines = [
    ['sku', 'title', 'stockQty', 'oldSiteUrl', 'newSiteUrl', 'id'].map(csvEscape).join(','),
    ...rows.map((row) =>
      [row.sku, row.title, row.stockQty, row.oldSiteUrl, row.newSiteUrl, row.id]
        .map(csvEscape)
        .join(','),
    ),
  ]

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        processedPublishedInStockProducts: processedProducts,
        visibleProductsWithoutImages: rows.length,
        reportPath: REPORT_PATH,
      },
      null,
      2,
    ),
  )
}

void main()
