import 'dotenv/config'

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { normalizeBrands, normalizeCategories, normalizeProducts } from './woocommerce/mapData'
import { parseWooCommerceDump } from './woocommerce/parseDump'
import { importIntoPayload } from './woocommerce/payloadImport'
import type { NormalizedProduct } from './woocommerce/types'

type ProductDoc = {
  id: string
  published?: boolean | null
  sku?: null | string
  sourceId?: null | number
  title?: null | string
}

const APPLY = process.argv.includes('--apply')
const NORMALIZE_DESCRIPTIONS = process.argv.includes('--normalize-descriptions')
const ONLY_HTML_DESCRIPTIONS = process.argv.includes('--only-html-descriptions')
const dumpArg = process.argv.find((arg) => arg.startsWith('--dump='))
const legacySiteUrlArg = process.argv.find((arg) => arg.startsWith('--legacy-site-url='))

const dumpPath = dumpArg
  ? path.resolve(process.cwd(), dumpArg.replace('--dump=', ''))
  : path.resolve(process.cwd(), '../nikelect_woocdb2019.sql')
const legacySiteUrl = legacySiteUrlArg?.replace('--legacy-site-url=', '') || process.env.LEGACY_SITE_URL
const reportPath = path.resolve(
  process.cwd(),
  `reports/woocommerce-product-diff-import-${APPLY ? 'write' : 'dry-run'}.json`,
)

const normalizeSku = (value: null | string | undefined) => (typeof value === 'string' ? value.trim() : '')

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const dump = await parseWooCommerceDump(dumpPath)
  const categories = normalizeCategories(dump)
  const brands = normalizeBrands(dump)
  const legacyProducts = dedupeLegacyProductsBySku(
    normalizeProducts(dump, {
      batchSize: 250,
      dryRun: !APPLY,
      dumpFile: dumpPath,
      legacySiteUrl,
      uploadsBaseUrl: process.env.LEGACY_UPLOADS_BASE_URL,
    }).filter((product) => normalizeSku(product.sku)),
  )

  const dbProducts = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      published: true,
      sku: true,
      sourceId: true,
      title: true,
    },
  })

  const dbDocs = dbProducts.docs as ProductDoc[]
  const dbBySourceId = new Map<number, ProductDoc>()
  const dbBySku = new Map<string, ProductDoc>()
  const dbSlugs = new Set<string>()

  for (const product of dbDocs) {
    if (typeof product.sourceId === 'number') dbBySourceId.set(product.sourceId, product)

    const sku = normalizeSku(product.sku)
    if (sku && !dbBySku.has(sku)) dbBySku.set(sku, product)
  }

  const matchedBySkuOnly: NormalizedProduct[] = []
  const newInLegacy: NormalizedProduct[] = []
  const matchedDbIds = new Set<string>()

  for (const product of legacyProducts) {
    const sourceMatch = dbBySourceId.get(product.sourceId)

    if (sourceMatch) {
      matchedDbIds.add(sourceMatch.id)
      continue
    }

    const skuMatch = dbBySku.get(normalizeSku(product.sku))

    if (skuMatch) {
      matchedDbIds.add(skuMatch.id)
      matchedBySkuOnly.push(product)
      continue
    }

    newInLegacy.push(product)
  }

  const onlyInDb = dbDocs.filter((product) => !matchedDbIds.has(product.id))
  const onlyInDbPublished = onlyInDb.filter((product) => product.published === true)
  const existingSlugs = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      slug: true,
    },
  })

  for (const product of existingSlugs.docs as Array<{ slug?: null | string }>) {
    if (product.slug) dbSlugs.add(product.slug)
  }

  const targetProducts = prepareTargetProducts({
    matchedBySkuOnly,
    newInLegacy,
    existingSlugs: dbSlugs,
    normalizeDescriptions: NORMALIZE_DESCRIPTIONS,
    onlyHtmlDescriptions: ONLY_HTML_DESCRIPTIONS,
  })

  let importResult: Awaited<ReturnType<typeof importIntoPayload>> | null = null
  let unpublished = 0

  if (APPLY) {
    importResult = await importIntoPayload({
      batchSize: 100,
      brands,
      categories,
      products: targetProducts,
      upsertTaxonomies: false,
    })

    for (const product of onlyInDbPublished) {
      await withRetry(() =>
        payload.update({
          id: product.id,
          collection: 'products',
          data: {
            published: false,
          },
          draft: false,
          overrideAccess: true,
        }),
      )
      unpublished += 1
    }
  }

  const report = {
    apply: APPLY,
    dumpPath,
    generatedAt: new Date().toISOString(),
    normalizeDescriptions: NORMALIZE_DESCRIPTIONS,
    onlyHtmlDescriptions: ONLY_HTML_DESCRIPTIONS,
    summary: {
      failedProducts: importResult?.failedProducts.length ?? 0,
      matchedBySkuOnly: matchedBySkuOnly.length,
      newInLegacy: newInLegacy.length,
      onlyInDb: onlyInDb.length,
      onlyInDbAlreadyUnpublished: onlyInDb.length - onlyInDbPublished.length,
      onlyInDbPublished: onlyInDbPublished.length,
      skippedMatchedBySourceId: legacyProducts.length - matchedBySkuOnly.length - newInLegacy.length,
      succeededProducts: importResult?.succeededProducts ?? 0,
      targetProducts: targetProducts.length,
      unpublished,
    },
    samples: {
      matchedBySkuOnly: matchedBySkuOnly.slice(0, 20).map(toSample),
      newInLegacy: newInLegacy.slice(0, 20).map(toSample),
      onlyInDb: onlyInDb.slice(0, 20).map((product) => ({
        id: product.id,
        published: product.published ?? null,
        sku: product.sku ?? null,
        sourceId: product.sourceId ?? null,
        title: product.title ?? null,
      })),
    },
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

function toSample(product: NormalizedProduct) {
  return {
    published: product.published,
    sku: product.sku ?? null,
    sourceId: product.sourceId,
    title: product.title,
  }
}

function dedupeLegacyProductsBySku(products: NormalizedProduct[]): NormalizedProduct[] {
  const bySku = new Map<string, NormalizedProduct>()

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

function prepareTargetProducts({
  existingSlugs,
  matchedBySkuOnly,
  newInLegacy,
  normalizeDescriptions,
  onlyHtmlDescriptions,
}: {
  existingSlugs: Set<string>
  matchedBySkuOnly: NormalizedProduct[]
  newInLegacy: NormalizedProduct[]
  normalizeDescriptions: boolean
  onlyHtmlDescriptions: boolean
}): NormalizedProduct[] {
  const usedSlugs = new Set(existingSlugs)
  const productsToMatch = onlyHtmlDescriptions
    ? matchedBySkuOnly.filter((product) => hasHtml(product.description))
    : matchedBySkuOnly
  const productsToCreate = onlyHtmlDescriptions
    ? newInLegacy.filter((product) => hasHtml(product.description))
    : newInLegacy
  const preparedMatched = productsToMatch.map((product) => normalizeProductForSecondPass(product, normalizeDescriptions))
  const preparedNew = productsToCreate.map((product) => {
    const nextProduct = normalizeProductForSecondPass(product, normalizeDescriptions)

    if (usedSlugs.has(nextProduct.slug)) {
      nextProduct.slug = `${nextProduct.slug}-${nextProduct.sourceId}`
    }

    usedSlugs.add(nextProduct.slug)
    return nextProduct
  })

  return [...preparedMatched, ...preparedNew]
}

function hasHtml(value?: string): boolean {
  return typeof value === 'string' && /<[^>]+>/.test(value)
}

function normalizeProductForSecondPass(
  product: NormalizedProduct,
  normalizeDescriptions: boolean,
): NormalizedProduct {
  return {
    ...product,
    ...(normalizeDescriptions ? { description: normalizeLegacyDescription(product.description) } : {}),
  }
}

function normalizeLegacyDescription(value?: string): string | undefined {
  if (!value) return undefined

  const text = value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#038;|&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text || undefined
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetryableMongoError(error) || attempt === attempts) break
      await delay(250 * attempt)
    }
  }

  throw lastError
}

function isRetryableMongoError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  const labels = 'errorLabelSet' in error ? (error as { errorLabelSet?: unknown }).errorLabelSet : undefined

  return code === 112 || (labels instanceof Set && labels.has('TransientTransactionError'))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
