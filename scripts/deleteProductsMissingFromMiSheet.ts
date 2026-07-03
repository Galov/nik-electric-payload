import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const APPLY = process.argv.includes('--apply')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_SHEET_PATH = path.resolve(process.cwd(), 'reports/nik-items-with-qtty-1-sheet1.json')
const sheetArg = process.argv.find((arg) => arg.startsWith('--sheet='))
const SHEET_PATH = sheetArg ? path.resolve(process.cwd(), sheetArg.replace('--sheet=', '')) : DEFAULT_SHEET_PATH

type SheetRow = {
  sku?: null | string
}

type ProductDoc = {
  id: string
  miProductId?: null | number
  published?: boolean | null
  sku?: null | string
  title?: null | string
}

const normalizeSku = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const hasMiProductId = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rawSheet = await fs.readFile(SHEET_PATH, 'utf8')
  const sheetRows = JSON.parse(rawSheet) as SheetRow[]
  const sheetSkus = new Set(sheetRows.map((row) => normalizeSku(row.sku)).filter(Boolean))

  const products = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      miProductId: true,
      published: true,
      sku: true,
      title: true,
    },
  })

  const candidates = (products.docs as ProductDoc[]).filter((product) => {
    const sku = normalizeSku(product.sku)

    if (!sku) {
      return false
    }

    if (sheetSkus.has(sku)) {
      return false
    }

    if (hasMiProductId(product.miProductId)) {
      return false
    }

    return true
  })

  let deleted = 0

  if (APPLY) {
    for (const product of candidates) {
      await payload.delete({
        collection: 'products',
        id: String(product.id),
        overrideAccess: true,
      })
      deleted += 1
    }
  }

  const report = {
    apply: APPLY,
    deleted,
    reportGeneratedAt: new Date().toISOString(),
    sheetPath: SHEET_PATH,
    summary: {
      candidates: candidates.length,
      published: candidates.filter((product) => product.published === true).length,
      unpublished: candidates.filter((product) => product.published !== true).length,
    },
    sample: candidates.slice(0, 50).map((product) => ({
      id: product.id,
      miProductId: product.miProductId ?? null,
      published: product.published ?? null,
      sku: product.sku ?? null,
      title: product.title ?? null,
    })),
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true })

  const reportPath = path.join(
    REPORTS_DIR,
    `delete-products-missing-from-mi-sheet-${APPLY ? 'write' : 'dry-run'}.json`,
  )

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

void main()
