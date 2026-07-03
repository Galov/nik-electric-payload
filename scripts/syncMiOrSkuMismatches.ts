import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { parseMicroinvestDescription } from '../src/utilities/microinvest'

const APPLY = process.argv.includes('--apply')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), 'reports/mi-id-sku-mismatches.json')
const DEFAULT_SHEET_PATH = path.resolve(process.cwd(), 'reports/nik-items-with-qtty-1-sheet1.json')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const sheetArg = process.argv.find((arg) => arg.startsWith('--sheet='))
const INPUT_PATH = inputArg ? path.resolve(process.cwd(), inputArg.replace('--input=', '')) : DEFAULT_INPUT_PATH
const SHEET_PATH = sheetArg ? path.resolve(process.cwd(), sheetArg.replace('--sheet=', '')) : DEFAULT_SHEET_PATH

type MismatchRow = {
  miProductId: number
  miSku: string
  miTitle: string
  ourSku: string
  ourTitle: string
  productId: string
  published: boolean
  slug: string
}

type SheetRow = {
  catalog3?: null | string
  description?: null | string
  id?: null | string
  priceGroup1?: null | string
  priceRetail?: null | string
  priceWholesale?: null | string
  stockQty?: null | string
  title?: null | string
  sku?: null | string
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

const resolveProductTypeFromSku = (sku: string) => {
  const normalized = normalizeText(sku).toUpperCase()

  if (normalized.endsWith('OR')) {
    return {
      isRefurbished: false,
      productType: 'original' as const,
    }
  }

  if (normalized.endsWith('R')) {
    return {
      isRefurbished: true,
      productType: 'removed-from-unit' as const,
    }
  }

  return {
    isRefurbished: false,
    productType: 'compatible' as const,
  }
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const raw = await fs.readFile(INPUT_PATH, 'utf8')
  const rawSheet = await fs.readFile(SHEET_PATH, 'utf8')
  const parsed = JSON.parse(raw) as { rows?: MismatchRow[] }
  const parsedSheet = JSON.parse(rawSheet) as SheetRow[]
  const rows = Array.isArray(parsed.rows) ? parsed.rows : []
  const sheetByMiId = new Map<number, SheetRow>()

  for (const row of parsedSheet) {
    const miProductId = parseNumber(row.id)

    if (miProductId == null || sheetByMiId.has(miProductId)) {
      continue
    }

    sheetByMiId.set(miProductId, row)
  }

  const updatable = rows.filter((row) => row.miSku === `${row.ourSku}OR`)
  const skipped = rows.filter((row) => row.miSku !== `${row.ourSku}OR`)

  const updated: Array<{
    miProductId: number
    newSku: string
    newTitle: string
    oldSku: string
    oldTitle: string
    productId: string
  }> = []

  if (APPLY) {
    for (const row of updatable) {
      const sheetRow = sheetByMiId.get(row.miProductId)
      const parsedDescription = parseMicroinvestDescription(sheetRow?.description)
      const derivedType = resolveProductTypeFromSku(row.miSku)

      await payload.update({
        collection: 'products',
        id: row.productId,
        data: {
          isRefurbished: derivedType.isRefurbished,
          manufacturerCode: normalizeText(sheetByMiId.get(row.miProductId)?.catalog3),
          originalSku: parsedDescription?.originalSku ?? undefined,
          price: parseNumber(sheetByMiId.get(row.miProductId)?.priceWholesale) ?? undefined,
          priceGroup1: parseNumber(sheetByMiId.get(row.miProductId)?.priceGroup1) ?? undefined,
          priceRetail: parseNumber(sheetByMiId.get(row.miProductId)?.priceRetail) ?? undefined,
          priceWholesale: parseNumber(sheetByMiId.get(row.miProductId)?.priceWholesale) ?? undefined,
          productType: derivedType.productType,
          slug: row.slug,
          sku: row.miSku,
          stockQty: parseNumber(sheetByMiId.get(row.miProductId)?.stockQty) ?? undefined,
          stockStatus:
            (parseNumber(sheetByMiId.get(row.miProductId)?.stockQty) ?? 0) > 0 ? 'instock' : 'outofstock',
          title: row.miTitle,
        },
        depth: 0,
        overrideAccess: true,
      })

      updated.push({
        miProductId: row.miProductId,
        newSku: row.miSku,
        newTitle: row.miTitle,
        oldSku: row.ourSku,
        oldTitle: row.ourTitle,
        productId: row.productId,
      })
    }
  }

  const report = {
    apply: APPLY,
    inputPath: INPUT_PATH,
    reportGeneratedAt: new Date().toISOString(),
    summary: {
      skipped: skipped.length,
      totalRows: rows.length,
      updated: updatable.length,
    },
    updated: APPLY ? updated : updatable,
    skipped,
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true })

  const reportPath = path.join(REPORTS_DIR, `sync-mi-or-sku-mismatches-${APPLY ? 'write' : 'dry-run'}.json`)
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

void main()
