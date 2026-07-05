import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import {
  SKIP_CATEGORY_PRODUCT_COUNT_SYNC,
  syncCategoryProductCount,
} from '@/collections/Categories/hooks/syncCategoryProductCount'
import { type AnyBulkWriteOperation, MongoClient, ObjectId } from 'mongodb'
import { getPayload } from 'payload'

const APPLY = process.argv.includes('--apply')
const BULK = process.argv.includes('--bulk')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), 'reports/nik-items-with-qtty-1-sheet1.json')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const INPUT_PATH = inputArg ? path.resolve(process.cwd(), inputArg.replace('--input=', '')) : DEFAULT_INPUT_PATH

type SheetRow = {
  description?: null | string
  id?: null | string
  priceGroup1?: null | string
  priceRetail?: null | string
  priceWholesale?: null | string
  sku?: null | string
  stockQty?: null | string
  title?: null | string
}

type ProductDoc = {
  id: string
  miProductId?: null | number
  price?: null | number
  priceGroup1?: null | number
  priceRetail?: null | number
  priceWholesale?: null | number
  published?: null | boolean
  sku?: null | string
  stockQty?: null | number
  stockStatus?: null | string
  title?: null | string
}

type ReportRow = {
  changedFields: string[]
  matchedBy: 'miProductId' | 'sku'
  miProductId: number
  productId: string
  sku: string
  title: string
}

const normalizeText = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const parseNumber = (value: null | string | undefined) => {
  const normalized = normalizeText(value).replace(',', '.')

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : null
}

const sameNumber = (left: null | number | undefined, right: null | number | undefined) => {
  if (left == null && right == null) {
    return true
  }

  return left === right
}

const withCompatibilityFields = (data: Record<string, number | string | boolean>) => {
  if (typeof data.priceWholesale === 'number') {
    data.price = data.priceWholesale
    data.priceInEUR = data.priceWholesale
    data.priceInUSD = data.priceWholesale
    data.priceInEUREnabled = data.priceWholesale > 0
    data.priceInUSDEnabled = data.priceWholesale > 0
  }

  if (typeof data.stockQty === 'number') {
    data.inventory = data.stockQty
  }

  return data
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const rows = JSON.parse(raw) as SheetRow[]
  const productsResult = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      miProductId: true,
      price: true,
      priceGroup1: true,
      priceRetail: true,
      priceWholesale: true,
      published: true,
      sku: true,
      stockQty: true,
      stockStatus: true,
      title: true,
    },
  })
  const products = productsResult.docs as ProductDoc[]
  const productsByMiProductId = new Map<number, ProductDoc>()
  const productsBySku = new Map<string, ProductDoc[]>()

  for (const product of products) {
    if (typeof product.miProductId === 'number' && Number.isFinite(product.miProductId)) {
      productsByMiProductId.set(product.miProductId, product)
    }

    const sku = normalizeText(product.sku)
    if (sku) {
      const existing = productsBySku.get(sku) || []
      existing.push(product)
      productsBySku.set(sku, existing)
    }
  }

  const report = {
    apply: APPLY,
    bulk: BULK,
    inputPath: INPUT_PATH,
    invalidRows: [] as Array<{ line: number; reason: string; row: SheetRow }>,
    matchedByMiProductId: 0,
    matchedBySku: 0,
    missingInDb: [] as Array<{ line: number; miProductId: number; sku: string; title: string }>,
    multipleSkuMatches: [] as Array<{ line: number; miProductId: number; sku: string; productIds: string[] }>,
    reportGeneratedAt: new Date().toISOString(),
    unchanged: 0,
    updated: [] as ReportRow[],
    updateErrors: [] as Array<{ error: string; line: number; miProductId: number; productId: string; sku: string }>,
  }
  const bulkOperations: AnyBulkWriteOperation[] = []

  for (const [index, rawRow] of rows.entries()) {
    const line = index + 2
    const miProductId = parseNumber(rawRow.id)
    const sku = normalizeText(rawRow.sku)
    const title = normalizeText(rawRow.title)

    if (miProductId == null || !sku) {
      report.invalidRows.push({
        line,
        reason: 'Липсва валидно MI ID или SKU.',
        row: rawRow,
      })
      continue
    }

    const priceRetail = parseNumber(rawRow.priceRetail)
    const priceWholesale = parseNumber(rawRow.priceWholesale)
    const priceGroup1 = parseNumber(rawRow.priceGroup1)
    const stockQty = parseNumber(rawRow.stockQty)

    let product = productsByMiProductId.get(miProductId) || null

    let matchedBy: 'miProductId' | 'sku' | null = product ? 'miProductId' : null

    if (!product) {
      const skuMatches = productsBySku.get(sku) || []

      if (skuMatches.length > 1) {
        report.multipleSkuMatches.push({
          line,
          miProductId,
          productIds: skuMatches.map((doc) => String(doc.id)),
          sku,
        })
        continue
      }

      product = skuMatches[0] || null
      matchedBy = product ? 'sku' : null
    }

    if (!product || !matchedBy) {
      report.missingInDb.push({
        line,
        miProductId,
        sku,
        title: title || sku,
      })
      continue
    }

    if (matchedBy === 'miProductId') {
      report.matchedByMiProductId += 1
    } else {
      report.matchedBySku += 1
    }

    const nextData: Record<string, number | string | boolean> = {
      miProductId,
      sku,
      published: true,
    }
    const changedFields: string[] = []

    if (product.sku !== sku) {
      changedFields.push('sku')
    }

    if (!sameNumber(typeof product.priceRetail === 'number' ? product.priceRetail : null, priceRetail)) {
      changedFields.push('priceRetail')
    }
    if (priceRetail != null) {
      nextData.priceRetail = priceRetail
    }

    if (!sameNumber(typeof product.priceWholesale === 'number' ? product.priceWholesale : null, priceWholesale)) {
      changedFields.push('priceWholesale')
    }
    if (priceWholesale != null) {
      nextData.priceWholesale = priceWholesale

      if (!sameNumber(typeof product.price === 'number' ? product.price : null, priceWholesale)) {
        changedFields.push('price')
      }
    }

    if (!sameNumber(typeof product.priceGroup1 === 'number' ? product.priceGroup1 : null, priceGroup1)) {
      changedFields.push('priceGroup1')
    }
    if (priceGroup1 != null) {
      nextData.priceGroup1 = priceGroup1
    }

    if (!sameNumber(typeof product.stockQty === 'number' ? product.stockQty : null, stockQty)) {
      changedFields.push('stockQty')
    }
    if (stockQty != null) {
      nextData.stockQty = stockQty
      const nextStockStatus = stockQty > 0 ? 'instock' : 'outofstock'
      nextData.stockStatus = nextStockStatus

      if ((product.stockStatus || null) !== nextStockStatus) {
        changedFields.push('stockStatus')
      }
    }

    if (product.published !== true) {
      changedFields.push('published')
    }

    if (!changedFields.length) {
      report.unchanged += 1
      continue
    }

    if (!APPLY) {
      report.updated.push({
        changedFields,
        matchedBy,
        miProductId,
        productId: String(product.id),
        sku,
        title: product.title || title || sku,
      })

      if (matchedBy === 'sku') {
        productsByMiProductId.set(miProductId, product)
      }
      continue
    }

    try {
      const updateData = withCompatibilityFields({ ...nextData })

      if (BULK) {
        bulkOperations.push({
          updateOne: {
            filter: { _id: new ObjectId(String(product.id)) },
            update: {
              $set: {
                ...updateData,
                updatedAt: new Date(),
              },
            },
          },
        })

        report.updated.push({
          changedFields,
          matchedBy,
          miProductId,
          productId: String(product.id),
          sku,
          title: product.title || title || sku,
        })

        Object.assign(product, updateData)
        productsByMiProductId.set(miProductId, product)
        continue
      }

      await payload.update({
        collection: 'products',
        context: {
          [SKIP_CATEGORY_PRODUCT_COUNT_SYNC]: true,
          skipIbisProductSync: true,
        },
        id: String(product.id),
        data: updateData,
        overrideAccess: true,
      })

      report.updated.push({
        changedFields,
        matchedBy,
        miProductId,
        productId: String(product.id),
        sku,
        title: product.title || title || sku,
      })

      Object.assign(product, nextData)
      productsByMiProductId.set(miProductId, product)
    } catch (error) {
      report.updateErrors.push({
        error: error instanceof Error ? error.message : 'Unknown error',
        line,
        miProductId,
        productId: String(product.id),
        sku,
      })
    }
  }

  let bulkWriteResult: { matchedCount: number; modifiedCount: number } | null = null

  if (APPLY && BULK && bulkOperations.length) {
    const client = new MongoClient(process.env.DATABASE_URL || '')

    try {
      await client.connect()
      const db = client.db()
      const result = await db.collection('products').bulkWrite(bulkOperations, { ordered: false })

      bulkWriteResult = {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    } finally {
      await client.close()
    }
  }

  if (APPLY && (bulkOperations.length > 0 || report.updated.length > 0)) {
    await syncCategoryProductCount(payload)
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true })
  const reportPath = path.join(REPORTS_DIR, `sync-products-from-mi-sheet-${APPLY ? 'write' : 'dry-run'}.json`)
  await fs.writeFile(reportPath, `${JSON.stringify({ ...report, bulkWriteResult, reportPath }, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        bulk: BULK,
        bulkWriteResult,
        invalidRows: report.invalidRows.length,
        matchedByMiProductId: report.matchedByMiProductId,
        matchedBySku: report.matchedBySku,
        missingInDb: report.missingInDb.length,
        multipleSkuMatches: report.multipleSkuMatches.length,
        reportPath,
        unchanged: report.unchanged,
        updateErrors: report.updateErrors.length,
        updated: report.updated.length,
      },
      null,
      2,
    ),
  )
}

void main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
