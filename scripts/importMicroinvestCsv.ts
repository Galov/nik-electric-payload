import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { parseMicroinvestDescription } from '../src/utilities/microinvest'

const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_FILE_PATH = path.resolve(process.cwd(), '../Nik_Export.csv')
const APPLY = process.argv.includes('--apply')
const fileArg = process.argv.find((arg) => arg.startsWith('--file='))
const FILE_PATH = fileArg ? path.resolve(process.cwd(), fileArg.replace('--file=', '')) : DEFAULT_FILE_PATH

type CsvRow = {
  deleted: number | null
  id: number | null
  isVeryUsed: number | null
  manufacturerCode: string
  originalCode: string
  priceGroup1: number | null
  priceRetail: number | null
  priceWholesale: number | null
  quantity: number | null
  raw: string
  sku: string
}

type ImportReport = {
  apply: boolean
  createdProducts: number
  createdMiIds: number
  filePath: string
  invalidRows: Array<{ line: number; reason: string; raw: string }>
  matchedByMiProductId: number
  matchedBySku: number
  productsToCreate: Array<{ id: number | null; line: number; raw: string; sku: string }>
  processed: number
  reportPath?: string
  updated: number
  updateErrors: Array<{ error: string; id: number | null; line: number; sku: string }>
}

const normalizeText = (value: string) => value.trim()

const parseNumber = (value: string) => {
  const normalized = normalizeText(value).replace(',', '.')

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : null
}

const parseRows = (source: string): CsvRow[] => {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) {
    return []
  }

  const separator = lines[0].includes('|') ? '|' : ';'

  return lines.slice(1).map((line) => {
    const columns = line.split(separator)

    return {
      deleted: parseNumber(columns[7] || ''),
      id: parseNumber(columns[0] || ''),
      isVeryUsed: parseNumber(columns[6] || ''),
      manufacturerCode: normalizeText(columns[2] || ''),
      originalCode: normalizeText(columns[8] || ''),
      priceGroup1: parseNumber(columns[4] || ''),
      priceRetail: parseNumber(columns[5] || ''),
      priceWholesale: parseNumber(columns[3] || ''),
      quantity: parseNumber(columns[9] || ''),
      raw: line,
      sku: normalizeText(columns[1] || ''),
    }
  })
}

const resolvePublished = ({
  deleted,
  isVeryUsed,
}: Pick<CsvRow, 'deleted' | 'isVeryUsed'>) => {
  if (deleted === -1) {
    return false
  }

  if (deleted === 0 && (isVeryUsed === 0 || isVeryUsed === -1)) {
    return true
  }

  return undefined
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product'

const buildProductData = (row: CsvRow) => {
  const nextData: Record<string, number | string | boolean> = {
    manufacturerCode: row.manufacturerCode,
  }

  if (typeof row.id === 'number') {
    nextData.miProductId = row.id
  }

  if (typeof row.priceRetail === 'number') {
    nextData.priceRetail = row.priceRetail
  }

  if (typeof row.priceWholesale === 'number') {
    nextData.priceWholesale = row.priceWholesale
    nextData.price = row.priceWholesale
  }

  if (typeof row.priceGroup1 === 'number') {
    nextData.priceGroup1 = row.priceGroup1
  }

  if (typeof row.quantity === 'number') {
    nextData.stockQty = row.quantity
    nextData.stockStatus = row.quantity > 0 ? 'instock' : 'outofstock'
  }

  const published = resolvePublished(row)

  if (typeof published === 'boolean') {
    nextData.published = published
  }

  if (row.originalCode) {
    const parsedDescription = parseMicroinvestDescription(row.originalCode)

    if (parsedDescription) {
      nextData.originalSku = parsedDescription.originalSku
      nextData.productType = parsedDescription.productType
      nextData.isRefurbished = parsedDescription.isRefurbished
    }
  }

  return nextData
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const report: ImportReport = {
    apply: APPLY,
    createdProducts: 0,
    createdMiIds: 0,
    filePath: FILE_PATH,
    invalidRows: [],
    matchedByMiProductId: 0,
    matchedBySku: 0,
    productsToCreate: [],
    processed: 0,
    updated: 0,
    updateErrors: [],
  }

  const fileContents = fs.readFileSync(FILE_PATH, 'latin1')
  const rows = parseRows(fileContents)

  for (const [index, row] of rows.entries()) {
    const line = index + 2

    if (typeof row.id !== 'number' || !row.sku) {
      report.invalidRows.push({
        line,
        raw: row.raw,
        reason: 'Липсва валидно ID или SKU.',
      })
      continue
    }

    report.processed += 1

    let product =
      (
        await payload.find({
          collection: 'products',
          depth: 0,
          limit: 1,
          overrideAccess: true,
          pagination: false,
          where: {
            miProductId: {
              equals: row.id,
            },
          },
        })
      ).docs[0] || null

    let matchedBy: 'miProductId' | 'sku' | null = product ? 'miProductId' : null

    if (!product) {
      product =
        (
          await payload.find({
            collection: 'products',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            pagination: false,
            where: {
              sku: {
                equals: row.sku,
              },
            },
          })
        ).docs[0] || null

      matchedBy = product ? 'sku' : null
    }

    const nextData = buildProductData(row)

    if (!product || !matchedBy) {
      report.productsToCreate.push({
        id: row.id,
        line,
        raw: row.raw,
        sku: row.sku,
      })

      if (!APPLY) {
        report.createdProducts += 1
        continue
      }

      try {
        const createData = {
          ...nextData,
          price: typeof nextData.price === 'number' ? nextData.price : 0,
          priceGroup1: typeof nextData.priceGroup1 === 'number' ? nextData.priceGroup1 : 0,
          priceRetail: typeof nextData.priceRetail === 'number' ? nextData.priceRetail : 0,
          priceWholesale: typeof nextData.priceWholesale === 'number' ? nextData.priceWholesale : 0,
          slug: slugify(row.sku),
          sku: row.sku,
          title: row.sku,
        }

        await payload.create({
          collection: 'products',
          data: createData,
          draft: false,
          overrideAccess: true,
        })

        report.createdProducts += 1
      } catch (error) {
        report.updateErrors.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          id: row.id,
          line,
          sku: row.sku,
        })
      }

      continue
    }

    if (matchedBy === 'miProductId') {
      report.matchedByMiProductId += 1
    }

    if (matchedBy === 'sku') {
      report.matchedBySku += 1
    }

    if (typeof row.id === 'number' && product.miProductId !== row.id) {
      nextData.miProductId = row.id
      report.createdMiIds += 1
    }

    if (!APPLY) {
      report.updated += 1
      continue
    }

    try {
      await payload.update({
        id: product.id,
        collection: 'products',
        data: nextData,
        overrideAccess: true,
      })

      report.updated += 1
    } catch (error) {
      report.updateErrors.push({
        error: error instanceof Error ? error.message : 'Unknown error',
        id: row.id,
        line,
        sku: row.sku,
      })
    }
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(REPORTS_DIR, `mi-csv-import-${timestamp}.json`)
  report.reportPath = reportPath
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        apply: report.apply,
        createdProducts: report.createdProducts,
        createdMiIds: report.createdMiIds,
        invalidRows: report.invalidRows.length,
        matchedByMiProductId: report.matchedByMiProductId,
        matchedBySku: report.matchedBySku,
        productsToCreate: report.productsToCreate.length,
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
