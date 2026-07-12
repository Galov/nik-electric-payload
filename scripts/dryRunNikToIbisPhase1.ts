import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'
import { MongoClient, type Document, type WithId } from 'mongodb'

type ProductDoc = WithId<Document> & {
  price?: number | null
  priceRetail?: number | null
  published?: boolean | null
  sku?: null | string
  sourceId?: number | null
  sourcePrice?: number | null
  stockQty?: number | null
}

type ComparableProduct = {
  id: string
  published: boolean | null
  rawStockQty: number | null
  sku: string
  sourceId: number | null
  sourcePrice: number | null
  stockQty: number | null
}

type ReportRow = {
  sku: string
  nikProductId: string
  ibisProductId: string
  nikSourceId: number | null
  ibisSourceId: number | null
  oldSourcePrice: number | null
  newSourcePrice: number | null
  oldStockQty: number | null
  newStockQty: number | null
  oldStockStatus: string
  newStockStatus: string
  oldPublished: boolean | null
  newPublished: boolean | null
  changedFields: string[]
}

type ProblemRow = {
  reason: string
  sku: string
  nikProductId?: string
  ibisProductId?: string
  nikSourceId?: number | null
  ibisSourceId?: number | null
  nikMatches?: number
  ibisMatches?: number
  sourcePrice?: number | null
  stockQty?: number | null
  normalizedStockQty?: number | null
  published?: boolean | null
}

const PAGE_SIZE = 1000
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_NIK_DATABASE_NAME = 'NicElectrikPayload'

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return value
}

const getDatabaseName = ({
  defaultName,
  envName,
  url,
}: {
  defaultName?: string
  envName: string
  url: string
}) => {
  const explicitName = process.env[envName]?.trim()

  if (explicitName) {
    return explicitName
  }

  const parsed = new URL(url)
  const pathnameName = decodeURIComponent(parsed.pathname.replace(/^\//, '').trim())

  if (pathnameName) {
    return pathnameName
  }

  if (defaultName) {
    return defaultName
  }

  throw new Error(
    `${envName} is required when the connection URL does not include a database name.`,
  )
}

const normalizeSku = (value: unknown) => {
  if (typeof value !== 'string') return ''

  return value.trim().toUpperCase()
}

const getNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const roundMoney = (value: number | null) =>
  value === null ? null : Math.round((value + Number.EPSILON) * 100) / 100

const normalizeStockQty = (value: unknown) => {
  const numberValue = getNumber(value)

  if (numberValue === null) return null

  return Math.max(0, numberValue)
}

const getStockStatus = (stockQty: number | null) =>
  stockQty !== null && stockQty > 0 ? 'instock' : 'outofstock'

const toProduct = (doc: ProductDoc, source: 'ibis' | 'nik'): ComparableProduct => {
  const sourcePrice =
    source === 'nik'
      ? roundMoney(getNumber(doc.priceRetail))
      : roundMoney(getNumber(doc.sourcePrice))

  return {
    id: String(doc._id),
    published: typeof doc.published === 'boolean' ? doc.published : null,
    rawStockQty: getNumber(doc.stockQty),
    sku: normalizeSku(doc.sku),
    sourceId: getNumber(doc.sourceId),
    sourcePrice,
    stockQty: source === 'nik' ? normalizeStockQty(doc.stockQty) : getNumber(doc.stockQty),
  }
}

const fetchProducts = async ({
  client,
  databaseName,
  source,
}: {
  client: MongoClient
  databaseName: string
  source: 'ibis' | 'nik'
}) => {
  const collection = client.db(databaseName).collection<ProductDoc>('products')
  const select =
    source === 'nik'
      ? {
          priceRetail: 1,
          published: 1,
          sku: 1,
          sourceId: 1,
          stockQty: 1,
        }
      : {
          price: 1,
          published: 1,
          sku: 1,
          sourceId: 1,
          sourcePrice: 1,
          stockQty: 1,
        }

  const products: ComparableProduct[] = []
  const cursor = collection.find({}, { projection: select }).batchSize(PAGE_SIZE)

  for await (const doc of cursor) {
    products.push(toProduct(doc, source))
  }

  return products
}

const groupBySku = (products: ComparableProduct[]) => {
  const groups = new Map<string, ComparableProduct[]>()
  const missingSku: ComparableProduct[] = []

  for (const product of products) {
    if (!product.sku) {
      missingSku.push(product)
      continue
    }

    const group = groups.get(product.sku) || []
    group.push(product)
    groups.set(product.sku, group)
  }

  return { groups, missingSku }
}

const groupSkusBySourceId = (products: ComparableProduct[]) => {
  const groups = new Map<number, Set<string>>()

  for (const product of products) {
    if (product.sourceId === null || !product.sku) continue

    const group = groups.get(product.sourceId) || new Set<string>()
    group.add(product.sku)
    groups.set(product.sourceId, group)
  }

  return groups
}

const findCrossSourceIdConflict = ({
  otherSourceIdMap,
  product,
}: {
  otherSourceIdMap: Map<number, Set<string>>
  product: ComparableProduct
}) => {
  if (product.sourceId === null) {
    return null
  }

  const otherSkus = otherSourceIdMap.get(product.sourceId)

  if (!otherSkus || otherSkus.size === 0) {
    return null
  }

  if (otherSkus.size === 1 && otherSkus.has(product.sku)) {
    return null
  }

  return [...otherSkus]
}

const csvEscape = (value: unknown) => {
  if (Array.isArray(value)) {
    return csvEscape(value.join('|'))
  }

  const stringValue = value === null || value === undefined ? '' : String(value)

  return `"${stringValue.replace(/"/g, '""')}"`
}

const writeCsv = async (filePath: string, rows: Record<string, unknown>[]) => {
  const columns = rows[0] ? Object.keys(rows[0]) : ['empty']
  const lines = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ]

  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

const main = async () => {
  const nikUrl = getRequiredEnv('NIK_DATABASE_URL')
  const ibisUrl = getRequiredEnv('IBIS_DATABASE_URL')
  const nikDatabaseName = getDatabaseName({
    defaultName: DEFAULT_NIK_DATABASE_NAME,
    envName: 'NIK_DATABASE_NAME',
    url: nikUrl,
  })
  const ibisDatabaseName = getDatabaseName({
    envName: 'IBIS_DATABASE_NAME',
    url: ibisUrl,
  })

  const nikClient = new MongoClient(nikUrl, { readPreference: 'secondaryPreferred' })
  const ibisClient = new MongoClient(ibisUrl, { readPreference: 'secondaryPreferred' })

  await nikClient.connect()
  await ibisClient.connect()

  try {
    const [nikProducts, ibisProducts] = await Promise.all([
      fetchProducts({
        client: nikClient,
        databaseName: nikDatabaseName,
        source: 'nik',
      }),
      fetchProducts({
        client: ibisClient,
        databaseName: ibisDatabaseName,
        source: 'ibis',
      }),
    ])

    const nikBySku = groupBySku(nikProducts)
    const ibisBySku = groupBySku(ibisProducts)
    const nikSkusBySourceId = groupSkusBySourceId(nikProducts)
    const ibisSkusBySourceId = groupSkusBySourceId(ibisProducts)
    const wouldUpdate: ReportRow[] = []
    const skippedInvalidPrice: ProblemRow[] = []
    const notFoundInIbis: ProblemRow[] = []
    const ambiguous: ProblemRow[] = []
    let matched = 0
    let unchanged = 0
    let negativeStockQtyWouldSendAsZero = 0

    for (const product of nikBySku.missingSku) {
      ambiguous.push({
        reason: 'nik_missing_sku',
        sku: '',
        nikProductId: product.id,
        nikSourceId: product.sourceId,
        published: product.published,
        sourcePrice: product.sourcePrice,
        stockQty: product.stockQty,
      })
    }

    for (const product of ibisBySku.missingSku) {
      ambiguous.push({
        reason: 'ibis_missing_sku',
        sku: '',
        ibisProductId: product.id,
        ibisSourceId: product.sourceId,
        published: product.published,
        sourcePrice: product.sourcePrice,
        stockQty: product.stockQty,
      })
    }

    for (const [sku, nikMatches] of nikBySku.groups) {
      if (nikMatches.length !== 1) {
        ambiguous.push({
          reason: 'duplicate_sku_in_nik',
          sku,
          nikMatches: nikMatches.length,
        })
        continue
      }

      const nikProduct = nikMatches[0]

      const ibisMatches = ibisBySku.groups.get(sku) || []

      if (ibisMatches.length === 0) {
        notFoundInIbis.push({
          reason: 'not_found_by_sku',
          sku,
          nikProductId: nikProduct.id,
          nikSourceId: nikProduct.sourceId,
          normalizedStockQty: nikProduct.stockQty,
          published: nikProduct.published,
          sourcePrice: nikProduct.sourcePrice,
        })
        continue
      }

      if (ibisMatches.length !== 1) {
        ambiguous.push({
          reason: 'duplicate_sku_in_ibis',
          sku,
          ibisMatches: ibisMatches.length,
          nikProductId: nikProduct.id,
          nikSourceId: nikProduct.sourceId,
        })
        continue
      }

      const ibisProduct = ibisMatches[0]
      const nikSourceIdConflictSkus = findCrossSourceIdConflict({
        otherSourceIdMap: ibisSkusBySourceId,
        product: nikProduct,
      })
      const ibisSourceIdConflictSkus = findCrossSourceIdConflict({
        otherSourceIdMap: nikSkusBySourceId,
        product: ibisProduct,
      })

      if (nikSourceIdConflictSkus || ibisSourceIdConflictSkus) {
        ambiguous.push({
          reason: 'source_id_points_to_different_sku',
          sku,
          ibisProductId: ibisProduct.id,
          ibisSourceId: ibisProduct.sourceId,
          nikProductId: nikProduct.id,
          nikSourceId: nikProduct.sourceId,
          ...(nikSourceIdConflictSkus
            ? { ibisSkusWithNikSourceId: nikSourceIdConflictSkus.join('|') }
            : {}),
          ...(ibisSourceIdConflictSkus
            ? { nikSkusWithIbisSourceId: ibisSourceIdConflictSkus.join('|') }
            : {}),
        })
        continue
      }

      matched += 1

      if (nikProduct.sourcePrice === null || nikProduct.sourcePrice <= 0) {
        skippedInvalidPrice.push({
          reason: 'invalid_nik_source_price',
          sku,
          nikProductId: nikProduct.id,
          nikSourceId: nikProduct.sourceId,
          sourcePrice: nikProduct.sourcePrice,
        })
        continue
      }

      const changedFields: string[] = []
      const oldStockStatus = getStockStatus(ibisProduct.stockQty)
      const newStockStatus = getStockStatus(nikProduct.stockQty)

      if (roundMoney(ibisProduct.sourcePrice) !== nikProduct.sourcePrice) {
        changedFields.push('sourcePrice')
      }

      if (ibisProduct.stockQty !== nikProduct.stockQty) {
        changedFields.push('stockQty')
      }

      if (oldStockStatus !== newStockStatus) {
        changedFields.push('stockStatus')
      }

      if (ibisProduct.published !== nikProduct.published) {
        changedFields.push('published')
      }

      if (!changedFields.length) {
        unchanged += 1
        continue
      }

      wouldUpdate.push({
        changedFields,
        ibisProductId: ibisProduct.id,
        ibisSourceId: ibisProduct.sourceId,
        newPublished: nikProduct.published,
        newSourcePrice: nikProduct.sourcePrice,
        newStockQty: nikProduct.stockQty,
        newStockStatus,
        nikProductId: nikProduct.id,
        nikSourceId: nikProduct.sourceId,
        oldPublished: ibisProduct.published,
        oldSourcePrice: roundMoney(ibisProduct.sourcePrice),
        oldStockQty: ibisProduct.stockQty,
        oldStockStatus,
        sku,
      })
    }

    for (const product of nikProducts) {
      if (product.rawStockQty !== null && product.rawStockQty < 0) {
        negativeStockQtyWouldSendAsZero += 1
      }
    }

    const report = {
      mode: 'dry-run',
      generatedAt: new Date().toISOString(),
      inputs: {
        ibisDatabaseName,
        nikDatabaseName,
      },
      totals: {
        ambiguous: ambiguous.length,
        checked: nikProducts.length,
        matched,
        notFoundInIbis: notFoundInIbis.length,
        skippedInvalidPrice: skippedInvalidPrice.length,
        unchanged,
        wouldUpdate: wouldUpdate.length,
      },
      negativeStockQtySummary: {
        count: negativeStockQtyWouldSendAsZero,
        wouldSendAs: 0,
      },
      wouldUpdate,
      skippedInvalidPrice,
      notFoundInIbis,
      ambiguous,
    }

    await fs.mkdir(REPORTS_DIR, { recursive: true })

    const jsonPath = path.join(REPORTS_DIR, 'nik-ibis-phase1-dry-run.json')
    const wouldUpdateCsvPath = path.join(REPORTS_DIR, 'nik-ibis-phase1-would-update.csv')
    const skippedInvalidPriceCsvPath = path.join(
      REPORTS_DIR,
      'nik-ibis-phase1-skipped-invalid-price.csv',
    )
    const notFoundCsvPath = path.join(REPORTS_DIR, 'nik-ibis-phase1-not-found-in-ibis.csv')
    const ambiguousCsvPath = path.join(REPORTS_DIR, 'nik-ibis-phase1-ambiguous.csv')

    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await writeCsv(wouldUpdateCsvPath, wouldUpdate)
    await writeCsv(skippedInvalidPriceCsvPath, skippedInvalidPrice)
    await writeCsv(notFoundCsvPath, notFoundInIbis)
    await writeCsv(ambiguousCsvPath, ambiguous)

    console.log(
      JSON.stringify(
        {
          ...report.totals,
          jsonPath,
          negativeStockQtySummary: report.negativeStockQtySummary,
          wouldUpdateCsvPath,
        },
        null,
        2,
      ),
    )
  } finally {
    await Promise.all([nikClient.close(), ibisClient.close()])
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
