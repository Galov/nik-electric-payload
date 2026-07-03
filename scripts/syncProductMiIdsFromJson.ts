import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const APPLY = process.argv.includes('--apply')
const fileArg = process.argv.find((arg) => arg.startsWith('--file='))
const FILE_PATH = fileArg ? path.resolve(process.cwd(), fileArg.replace('--file=', '')) : null

type InputRow = {
  id?: number | string | null
  sku?: null | string
  title?: null | string
}

type ParsedRow = {
  id: number | null
  line: number
  raw: InputRow
  sku: string
  title: string
}

type ProductRecord = {
  id: number | string
  miProductId?: number | null
  sku?: null | string
}

type Report = {
  alreadyMatched: number
  alreadyMatchedRows: Array<{
    line: number
    miProductId: number
    productId: number | string
    sku: string
  }>
  apply: boolean
  conflictingMiIds: Array<{
    existingProductId: number | string
    existingSku: string
    incomingMiProductId: number
    line: number
    sku: string
    targetProductId: number | string
  }>
  duplicateSkus: Array<{
    line: number
    matchedProductIds: Array<number | string>
    sku: string
  }>
  filePath: string | null
  invalidRows: Array<{
    line: number
    raw: InputRow
    reason: string
  }>
  missingProducts: Array<{
    line: number
    sku: string
    title: string
  }>
  overwrittenMiIds: number
  overwrittenRows: Array<{
    line: number
    nextMiProductId: number
    previousMiProductId: number
    productId: number | string
    sku: string
  }>
  processed: number
  reportPath?: string
  unchangedWrongType: number
  updated: number
  updatedRows: Array<{
    line: number
    nextMiProductId: number
    previousMiProductId: number | null
    productId: number | string
    sku: string
    status: 'updated' | 'would-update'
  }>
  updateErrors: Array<{
    error: string
    line: number
    sku: string
  }>
}

const normalizeSku = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const parseMiProductId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.')

    if (!trimmed) {
      return null
    }

    const parsed = Number(trimmed)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const loadRows = (filePath: string): ParsedRow[] => {
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw) as unknown

  if (!Array.isArray(data)) {
    throw new Error('Input JSON must contain an array.')
  }

  return data.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as InputRow) : {}

    return {
      id: parseMiProductId(row.id),
      line: index + 2,
      raw: row,
      sku: normalizeSku(row.sku),
      title: typeof row.title === 'string' ? row.title.trim() : '',
    }
  })
}

const loadAllProducts = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const products: ProductRecord[] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const result = await payload.find({
      collection: 'products',
      depth: 0,
      limit: 500,
      overrideAccess: true,
      page,
      pagination: true,
    })

    products.push(...(result.docs as ProductRecord[]))
    hasNextPage = result.hasNextPage
    page += 1
  }

  return products
}

const main = async () => {
  if (!FILE_PATH) {
    throw new Error('Missing --file=... argument.')
  }

  const payload = await getPayload({ config: configPromise })
  const rows = loadRows(FILE_PATH)
  const products = await loadAllProducts(payload)
  const report: Report = {
    alreadyMatched: 0,
    alreadyMatchedRows: [],
    apply: APPLY,
    conflictingMiIds: [],
    duplicateSkus: [],
    filePath: FILE_PATH,
    invalidRows: [],
    missingProducts: [],
    overwrittenMiIds: 0,
    overwrittenRows: [],
    processed: 0,
    unchangedWrongType: 0,
    updated: 0,
    updatedRows: [],
    updateErrors: [],
  }

  const productsBySku = new Map<string, ProductRecord[]>()
  const productsByMiId = new Map<number, ProductRecord[]>()

  for (const product of products) {
    const sku = normalizeSku(product.sku)

    if (sku) {
      const current = productsBySku.get(sku) || []
      current.push(product)
      productsBySku.set(sku, current)
    }

    if (typeof product.miProductId === 'number' && Number.isFinite(product.miProductId)) {
      const current = productsByMiId.get(product.miProductId) || []
      current.push(product)
      productsByMiId.set(product.miProductId, current)
    }
  }

  for (const row of rows) {
    if (typeof row.id !== 'number' || !row.sku) {
      report.invalidRows.push({
        line: row.line,
        raw: row.raw,
        reason: 'Липсва валидно Microinvest ID или SKU.',
      })
      continue
    }

    report.processed += 1

    const skuMatches = productsBySku.get(row.sku) || []

    if (!skuMatches.length) {
      report.missingProducts.push({
        line: row.line,
        sku: row.sku,
        title: row.title,
      })
      continue
    }

    if (skuMatches.length > 1) {
      report.duplicateSkus.push({
        line: row.line,
        matchedProductIds: skuMatches.map((doc) => doc.id),
        sku: row.sku,
      })
      continue
    }

    const product = skuMatches[0]
    const miIdMatches = productsByMiId.get(row.id) || []
    const conflictingProduct = miIdMatches.find((doc) => doc.id !== product.id)

    if (conflictingProduct) {
      report.conflictingMiIds.push({
        existingProductId: conflictingProduct.id,
        existingSku: conflictingProduct.sku || '',
        incomingMiProductId: row.id,
        line: row.line,
        sku: row.sku,
        targetProductId: product.id,
      })
      continue
    }

    if (product.miProductId === row.id) {
      report.alreadyMatched += 1
      report.alreadyMatchedRows.push({
        line: row.line,
        miProductId: row.id,
        productId: product.id,
        sku: row.sku,
      })
      continue
    }

    const previousMiProductId =
      typeof product.miProductId === 'number' && Number.isFinite(product.miProductId) ? product.miProductId : null

    if (typeof product.miProductId === 'number' && Number.isFinite(product.miProductId)) {
      report.overwrittenMiIds += 1
      report.overwrittenRows.push({
        line: row.line,
        nextMiProductId: row.id,
        previousMiProductId: product.miProductId,
        productId: product.id,
        sku: row.sku,
      })
    }

    if (!APPLY) {
      report.updatedRows.push({
        line: row.line,
        nextMiProductId: row.id,
        previousMiProductId,
        productId: product.id,
        sku: row.sku,
        status: 'would-update',
      })
      report.updated += 1
      continue
    }

    try {
      await payload.update({
        id: product.id,
        collection: 'products',
        data: {
          miProductId: row.id,
        },
        overrideAccess: true,
      })

      if (previousMiProductId !== null) {
        const previousEntries = productsByMiId.get(previousMiProductId) || []
        productsByMiId.set(
          previousMiProductId,
          previousEntries.filter((doc) => doc.id !== product.id),
        )
      }

      productsByMiId.set(
        row.id,
        [...(productsByMiId.get(row.id) || []).filter((doc) => doc.id !== product.id), { ...product, miProductId: row.id }],
      )
      report.updatedRows.push({
        line: row.line,
        nextMiProductId: row.id,
        previousMiProductId,
        productId: product.id,
        sku: row.sku,
        status: 'updated',
      })

      report.updated += 1
    } catch (error) {
      report.updateErrors.push({
        error: error instanceof Error ? error.message : 'Unknown error',
        line: row.line,
        sku: row.sku,
      })
    }
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `sync-product-mi-ids-${APPLY ? 'write' : 'dry-run'}-${timestamp}.json`)
  report.reportPath = reportPath
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        alreadyMatched: report.alreadyMatched,
        apply: report.apply,
        conflictingMiIds: report.conflictingMiIds.length,
        duplicateSkus: report.duplicateSkus.length,
        filePath: report.filePath,
        invalidRows: report.invalidRows.length,
        missingProducts: report.missingProducts.length,
        overwrittenMiIds: report.overwrittenMiIds,
        processed: report.processed,
        reportPath,
        updateErrors: report.updateErrors.length,
        updated: report.updated,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
