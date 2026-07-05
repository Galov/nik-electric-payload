import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'

import configPromise from '@payload-config'
import {
  SKIP_CATEGORY_PRODUCT_COUNT_SYNC,
  syncCategoryProductCount,
} from '@/collections/Categories/hooks/syncCategoryProductCount'
import { parseMicroinvestDescription } from '@/utilities/microinvest'
import { getPayload } from 'payload'

const APPLY = process.argv.includes('--apply')
const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), 'reports/nik-items-with-qtty-1-sheet1.json')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const INPUT_PATH = inputArg ? path.resolve(process.cwd(), inputArg.replace('--input=', '')) : DEFAULT_INPUT_PATH

type SheetRow = {
  catalog3?: null | string
  description?: null | string
  id?: null | string
  priceGroup1?: null | string
  priceRetail?: null | string
  priceWholesale?: null | string
  sku?: null | string
  stockQty?: null | string
  title?: null | string
}

type ExistingProduct = {
  id: string
  miProductId?: null | number
  sku?: null | string
}

type ProductData = {
  inventory: number
  isRefurbished?: boolean
  manufacturerCode?: string
  miProductId: number
  originalSku?: string
  price: number
  priceGroup1: number
  priceInEUR: number
  priceInEUREnabled: boolean
  priceInUSD: number
  priceInUSDEnabled: boolean
  priceRetail: number
  priceWholesale: number
  productType?: 'compatible' | 'original' | 'removed-from-unit'
  published: boolean
  sku: string
  slug: string
  stockQty: number
  stockStatus: 'instock' | 'outofstock'
  title: string
}

const normalizeText = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const parseNumber = (value: null | string | undefined) => {
  const normalized = normalizeText(value).replace(',', '.')

  if (!normalized) return null

  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : null
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product'

const normalizeTitle = ({ sku, title }: { sku: string; title: string }) => {
  const normalizedTitle = normalizeText(title)

  if (!normalizedTitle) return sku

  const escapedSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixPattern = new RegExp(`^${escapedSku}\\s*-\\s*`, 'i')
  const stripped = normalizedTitle.replace(prefixPattern, '').trim()

  return stripped || normalizedTitle
}

const buildProductData = ({
  miProductId,
  row,
  sku,
}: {
  miProductId: number
  row: SheetRow
  sku: string
}): ProductData => {
  const priceRetail = parseNumber(row.priceRetail) ?? 0
  const priceWholesale = parseNumber(row.priceWholesale) ?? 0
  const priceGroup1 = parseNumber(row.priceGroup1) ?? 0
  const stockQty = parseNumber(row.stockQty) ?? 0
  const parsedDescription = parseMicroinvestDescription(row.description)
  const manufacturerCode = normalizeText(row.catalog3)

  return {
    inventory: stockQty,
    ...(parsedDescription
      ? {
          isRefurbished: parsedDescription.isRefurbished,
          originalSku: parsedDescription.originalSku,
          productType: parsedDescription.productType,
        }
      : {}),
    ...(manufacturerCode ? { manufacturerCode } : {}),
    miProductId,
    price: priceWholesale,
    priceGroup1,
    priceInEUR: priceWholesale,
    priceInEUREnabled: priceWholesale > 0,
    priceInUSD: priceWholesale,
    priceInUSDEnabled: priceWholesale > 0,
    priceRetail,
    priceWholesale,
    published: true,
    sku,
    slug: slugify(sku),
    stockQty,
    stockStatus: stockQty > 0 ? 'instock' : 'outofstock',
    title: normalizeTitle({ sku, title: normalizeText(row.title) }),
  }
}

const fetchExistingProducts = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const result = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      miProductId: true,
      sku: true,
    },
  })

  return result.docs as ExistingProduct[]
}

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const rawRows = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8')) as SheetRow[]
  const existingProducts = await fetchExistingProducts(payload)
  const existingByMiProductId = new Map<number, ExistingProduct>()
  const existingBySku = new Map<string, ExistingProduct[]>()
  const seenMiProductIds = new Set<number>()
  const seenSkus = new Set<string>()

  for (const product of existingProducts) {
    if (typeof product.miProductId === 'number') {
      existingByMiProductId.set(product.miProductId, product)
    }

    const sku = normalizeText(product.sku)

    if (sku) {
      const matches = existingBySku.get(sku) || []
      matches.push(product)
      existingBySku.set(sku, matches)
    }
  }

  const invalidRows: Array<{ line: number; reason: string; row: SheetRow }> = []
  const skippedExisting: Array<{ line: number; miProductId: number; productId: string; sku: string }> = []
  const skippedDuplicateRows: Array<{ line: number; miProductId: number; sku: string }> = []
  const productsToCreate: Array<{ data: ProductData; line: number }> = []
  const created: Array<{ line: number; miProductId: number; productId: string; sku: string; title: string }> = []
  const createErrors: Array<{ error: string; line: number; miProductId: number; sku: string }> = []

  for (const [index, row] of rawRows.entries()) {
    const line = index + 2
    const miProductId = parseNumber(row.id)
    const sku = normalizeText(row.sku)

    if (miProductId == null || !sku) {
      invalidRows.push({
        line,
        reason: 'Липсва валидно MI ID или SKU.',
        row,
      })
      continue
    }

    if (seenMiProductIds.has(miProductId) || seenSkus.has(sku)) {
      skippedDuplicateRows.push({ line, miProductId, sku })
      continue
    }

    seenMiProductIds.add(miProductId)
    seenSkus.add(sku)

    const existingByMiID = existingByMiProductId.get(miProductId)
    const existingSkuMatches = existingBySku.get(sku) || []
    const existingProduct = existingByMiID || existingSkuMatches[0] || null

    if (existingProduct) {
      skippedExisting.push({
        line,
        miProductId,
        productId: String(existingProduct.id),
        sku,
      })
      continue
    }

    productsToCreate.push({
      data: buildProductData({ miProductId, row, sku }),
      line,
    })
  }

  if (APPLY) {
    for (const product of productsToCreate) {
      try {
        const createdProduct = await payload.create({
          collection: 'products',
          context: {
            [SKIP_CATEGORY_PRODUCT_COUNT_SYNC]: true,
            skipIbisProductSync: true,
          },
          data: product.data,
          draft: false,
          overrideAccess: true,
        })

        created.push({
          line: product.line,
          miProductId: product.data.miProductId,
          productId: String(createdProduct.id),
          sku: product.data.sku,
          title: product.data.title,
        })
      } catch (error) {
        createErrors.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          line: product.line,
          miProductId: product.data.miProductId,
          sku: product.data.sku,
        })
      }
    }

    if (created.length > 0) {
      await syncCategoryProductCount(payload)
    }
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true })

  const reportPath = path.join(
    REPORTS_DIR,
    `create-missing-products-from-mi-sheet-${APPLY ? 'write' : 'dry-run'}.json`,
  )
  const report = {
    apply: APPLY,
    createErrors,
    created,
    createdCount: created.length,
    inputPath: INPUT_PATH,
    invalidRows,
    productsToCreate: productsToCreate.map((product) => ({
      line: product.line,
      miProductId: product.data.miProductId,
      sku: product.data.sku,
      title: product.data.title,
      priceRetail: product.data.priceRetail,
      priceWholesale: product.data.priceWholesale,
      priceGroup1: product.data.priceGroup1,
      stockQty: product.data.stockQty,
      manufacturerCode: product.data.manufacturerCode ?? null,
      originalSku: product.data.originalSku ?? null,
      productType: product.data.productType ?? null,
    })),
    productsToCreateCount: productsToCreate.length,
    reportPath,
    skippedDuplicateRows,
    skippedExistingCount: skippedExisting.length,
  }

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        createErrors: createErrors.length,
        created: created.length,
        invalidRows: invalidRows.length,
        productsToCreate: productsToCreate.length,
        reportPath,
        skippedDuplicateRows: skippedDuplicateRows.length,
        skippedExisting: skippedExisting.length,
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
