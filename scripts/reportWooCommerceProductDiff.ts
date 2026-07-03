import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { normalizeProducts } from './woocommerce/mapData'
import { parseWooCommerceDump } from './woocommerce/parseDump'

type ProductDoc = {
  id: string
  images?: Array<unknown> | null
  legacyProductUrl?: null | string
  published?: boolean | null
  sku?: null | string
  sourceId?: null | number
  title?: null | string
}

type ReportRow = {
  id?: string
  imagesCount?: number
  legacyProductUrl?: null | string
  published?: boolean | null
  sku: string
  sourceId?: number | null
  title: string
}

const dumpArg = process.argv.find((arg) => arg.startsWith('--dump='))
const legacySiteUrlArg = process.argv.find((arg) => arg.startsWith('--legacy-site-url='))
const reportArg = process.argv.find((arg) => arg.startsWith('--report='))

if (!dumpArg) {
  throw new Error('Missing --dump=/absolute/path/to/sql')
}

const dumpPath = path.resolve(process.cwd(), dumpArg.replace('--dump=', ''))
const legacySiteUrl = legacySiteUrlArg?.replace('--legacy-site-url=', '') || process.env.LEGACY_SITE_URL
const reportPath = reportArg
  ? path.resolve(process.cwd(), reportArg.replace('--report=', ''))
  : path.resolve(process.cwd(), 'reports/woocommerce-product-diff.json')

const normalizeSku = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const toReportRow = (item: {
  id?: string
  images?: Array<unknown> | null
  legacyProductUrl?: null | string
  published?: boolean | null
  sku?: null | string
  sourceId?: null | number
  title?: null | string
}): ReportRow => ({
  ...(item.id ? { id: item.id } : {}),
  ...(Array.isArray(item.images) ? { imagesCount: item.images.length } : {}),
  ...(item.legacyProductUrl ? { legacyProductUrl: item.legacyProductUrl } : {}),
  ...(typeof item.published === 'boolean' ? { published: item.published } : {}),
  sku: normalizeSku(item.sku),
  sourceId: typeof item.sourceId === 'number' ? item.sourceId : null,
  title: item.title?.trim() || '',
})

const csvEscape = (value: unknown) => {
  if (value === null || typeof value === 'undefined') return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const writeCsv = async (filePath: string, rows: Array<Record<string, unknown>>) => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ]

  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const dump = await parseWooCommerceDump(dumpPath)
  const rawLegacyProducts = normalizeProducts(dump, {
    batchSize: 250,
    dryRun: true,
    dumpFile: dumpPath,
    legacySiteUrl,
    uploadsBaseUrl: process.env.LEGACY_UPLOADS_BASE_URL,
  })
  const legacyProducts = dedupeLegacyProductsBySku(rawLegacyProducts)

  const dbProducts = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      published: true,
      images: true,
      legacyProductUrl: true,
      sku: true,
      sourceId: true,
      title: true,
    },
  })

  const dbDocs = dbProducts.docs as ProductDoc[]
  const ignoredLegacyMissingSku = rawLegacyProducts.filter((product) => !normalizeSku(product.sku))
  const legacyWithSku = legacyProducts.filter((product) => normalizeSku(product.sku))

  const dbBySourceId = new Map<number, ProductDoc>()
  const dbBySku = new Map<string, ProductDoc[]>()

  for (const product of dbDocs) {
    if (typeof product.sourceId === 'number') dbBySourceId.set(product.sourceId, product)

    const sku = normalizeSku(product.sku)
    if (!sku) continue

    const list = dbBySku.get(sku) || []
    list.push(product)
    dbBySku.set(sku, list)
  }

  const matchedBySourceId: Array<{
    db: ReportRow
    legacy: ReportRow
  }> = []
  const matchedBySkuOnly: Array<{
    db: ReportRow
    legacy: ReportRow
  }> = []
  const newInLegacy: ReportRow[] = []

  const matchedDbIds = new Set<string>()

  for (const legacyProduct of legacyWithSku) {
    const bySourceId = dbBySourceId.get(legacyProduct.sourceId)

    if (bySourceId) {
      matchedDbIds.add(bySourceId.id)
      matchedBySourceId.push({
        db: toReportRow(bySourceId),
        legacy: toReportRow(legacyProduct),
      })
      continue
    }

    const sameSku = dbBySku.get(normalizeSku(legacyProduct.sku))

    if (sameSku?.length) {
      const dbProduct = sameSku[0]
      matchedDbIds.add(dbProduct.id)
      matchedBySkuOnly.push({
        db: toReportRow(dbProduct),
        legacy: toReportRow(legacyProduct),
      })
      continue
    }

    newInLegacy.push(toReportRow(legacyProduct))
  }

  const onlyInDb = dbDocs
    .filter((product) => !matchedDbIds.has(product.id))
    .map((product) => toReportRow(product))

  const report = {
    dumpPath,
    generatedAt: new Date().toISOString(),
    summary: {
      dbProducts: dbDocs.length,
      ignoredLegacyMissingSku: ignoredLegacyMissingSku.length,
      legacyProducts: legacyProducts.length,
      legacyProductsWithSku: legacyWithSku.length,
      matchedBySkuOnly: matchedBySkuOnly.length,
      matchedBySourceId: matchedBySourceId.length,
      newInLegacy: newInLegacy.length,
      onlyInDb: onlyInDb.length,
      onlyInDbPublished: onlyInDb.filter((product) => product.published === true).length,
      onlyInDbUnpublished: onlyInDb.filter((product) => product.published !== true).length,
    },
    samples: {
      ignoredLegacyMissingSku: ignoredLegacyMissingSku.slice(0, 20).map((product) => toReportRow(product)),
      matchedBySkuOnly: matchedBySkuOnly.slice(0, 50),
      newInLegacy: newInLegacy.slice(0, 50),
      onlyInDb: onlyInDb.slice(0, 50),
    },
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const reportDir = path.dirname(reportPath)
  const matchedBySkuOnlyCsv = path.join(reportDir, 'woocommerce-products-matched-by-sku-only.csv')
  const newInLegacyCsv = path.join(reportDir, 'woocommerce-products-new-in-legacy.csv')
  const onlyInDbCsv = path.join(reportDir, 'woocommerce-products-only-in-db.csv')

  await writeCsv(
    matchedBySkuOnlyCsv,
    matchedBySkuOnly.map(({ db, legacy }) => ({
      sku: legacy.sku,
      dbId: db.id,
      dbSourceId: db.sourceId,
      dbPublished: db.published,
      dbTitle: db.title,
      dbImagesCount: db.imagesCount,
      dbLegacyUrl: db.legacyProductUrl,
      legacySourceId: legacy.sourceId,
      legacyPublished: legacy.published,
      legacyTitle: legacy.title,
      legacyImagesCount: legacy.imagesCount,
      legacyUrl: legacy.legacyProductUrl,
      suggestedCheck: db.sourceId ? 'sourceId differs; inspect before update' : 'probably update existing product by SKU',
    })),
  )
  await writeCsv(
    newInLegacyCsv,
    newInLegacy.map((product) => ({
      sku: product.sku,
      sourceId: product.sourceId,
      published: product.published,
      title: product.title,
      imagesCount: product.imagesCount,
      legacyUrl: product.legacyProductUrl,
    })),
  )
  await writeCsv(
    onlyInDbCsv,
    onlyInDb.map((product) => ({
      id: product.id,
      sku: product.sku,
      sourceId: product.sourceId,
      published: product.published,
      title: product.title,
      imagesCount: product.imagesCount,
      legacyUrl: product.legacyProductUrl,
    })),
  )

  console.log(JSON.stringify({
    ...report,
    csvReports: {
      matchedBySkuOnly: matchedBySkuOnlyCsv,
      newInLegacy: newInLegacyCsv,
      onlyInDb: onlyInDbCsv,
    },
  }, null, 2))
}

function dedupeLegacyProductsBySku(products: ReturnType<typeof normalizeProducts>): ReturnType<typeof normalizeProducts> {
  const bySku = new Map<string, ReturnType<typeof normalizeProducts>[number]>()

  for (const product of products) {
    const sku = normalizeSku(product.sku)
    if (!sku) continue

    const existing = bySku.get(sku)

    if (!existing || (!existing.published && product.published)) {
      bySku.set(sku, product)
    }
  }

  return [...bySku.values()]
}

void main()
