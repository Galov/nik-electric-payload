import { getPayload } from 'payload'

import config from '../../src/payload.config'
import type { Brand, Category, Product } from '../../src/payload-types'
import type {
  NormalizedBrand,
  NormalizedCategory,
  NormalizedProduct,
  ProductImportFailure,
} from './types'

type ExistingCategory = Pick<Category, 'id' | 'slug' | 'sourceTaxonomyId' | 'sourceTermId'>
type ExistingBrand = Pick<Brand, 'id' | 'slug' | 'sourceTaxonomyId' | 'sourceTermId'>
type ExistingProduct = Pick<Product, 'id' | 'legacyProductUrl' | 'sku' | 'slug' | 'sourceId'>

type ImportResult = {
  brandIdBySourceTaxonomyId: Map<number, string>
  categoryIdBySourceTaxonomyId: Map<number, string>
  failedProducts: ProductImportFailure[]
  succeededProducts: number
  unpublishedMissingProducts: number
}

export async function importIntoPayload({
  batchSize,
  brands,
  categories,
  products,
  upsertTaxonomies = true,
  unpublishMissingProducts = false,
}: {
  batchSize: number
  brands: NormalizedBrand[]
  categories: NormalizedCategory[]
  products: NormalizedProduct[]
  upsertTaxonomies?: boolean
  unpublishMissingProducts?: boolean
}): Promise<ImportResult> {
  const payload = await getPayload({ config })
  const failedProducts: ProductImportFailure[] = []
  const productsWithSku = products.filter((product) => normalizeSku(product.sku))

  const existingCategories = await fetchAll<ExistingCategory>({
    collection: 'categories',
    payload,
    select: {
      slug: true,
      sourceTaxonomyId: true,
      sourceTermId: true,
    },
  })

  const categoryIdBySourceTaxonomyId = upsertTaxonomies
    ? await upsertCategories(payload, categories, existingCategories)
    : mapExistingTaxonomyIds(existingCategories)

  const existingBrands = await fetchAll<ExistingBrand>({
    collection: 'brands',
    payload,
    select: {
      slug: true,
      sourceTaxonomyId: true,
      sourceTermId: true,
    },
  })

  const brandIdBySourceTaxonomyId = upsertTaxonomies
    ? await upsertBrands(payload, brands, existingBrands)
    : mapExistingTaxonomyIds(existingBrands)

  const existingProducts = await fetchAll<ExistingProduct>({
    collection: 'products',
    payload,
    select: {
      legacyProductUrl: true,
      sku: true,
      slug: true,
      sourceId: true,
    },
  })

  await upsertProducts(payload, {
    batchSize,
    brandIdBySourceTaxonomyId,
    categoryIdBySourceTaxonomyId,
    existingProducts,
    failedProducts,
    products: productsWithSku,
  })

  const unpublishedMissingProducts = unpublishMissingProducts
    ? await unpublishProductsMissingFromDump(payload, existingProducts, productsWithSku)
    : 0

  return {
    brandIdBySourceTaxonomyId,
    categoryIdBySourceTaxonomyId,
    failedProducts,
    succeededProducts: productsWithSku.length - failedProducts.length,
    unpublishedMissingProducts,
  }
}

function mapExistingTaxonomyIds<T extends { id: string; sourceTaxonomyId?: null | number }>(
  existing: T[],
): Map<number, string> {
  const idBySourceTaxonomyId = new Map<number, string>()

  for (const item of existing) {
    if (typeof item.sourceTaxonomyId === 'number') {
      idBySourceTaxonomyId.set(item.sourceTaxonomyId, item.id)
    }
  }

  return idBySourceTaxonomyId
}

async function upsertCategories(
  payload: Awaited<ReturnType<typeof getPayload>>,
  categories: NormalizedCategory[],
  existing: ExistingCategory[],
): Promise<Map<number, string>> {
  const idBySourceTaxonomyId = new Map<number, string>()
  const existingBySourceTaxonomyId = new Map<number, ExistingCategory>()

  for (const item of existing) {
    if (typeof item.sourceTaxonomyId === 'number') {
      existingBySourceTaxonomyId.set(item.sourceTaxonomyId, item)
      idBySourceTaxonomyId.set(item.sourceTaxonomyId, item.id)
    }
  }

  for (const category of categories) {
    const existingCategory = existingBySourceTaxonomyId.get(category.sourceTaxonomyId)
    const data = {
      parent: null as string | null,
      productCount: category.productCount,
      slug: category.slug,
      sourceTaxonomyId: category.sourceTaxonomyId,
      sourceTermId: category.sourceTermId,
      title: category.title,
    }

    if (existingCategory) {
      await payload.update({
        id: existingCategory.id,
        collection: 'categories',
        data,
        overrideAccess: true,
      })
      idBySourceTaxonomyId.set(category.sourceTaxonomyId, existingCategory.id)
      continue
    }

    const created = await payload.create({
      collection: 'categories',
      data,
      overrideAccess: true,
    })

    idBySourceTaxonomyId.set(category.sourceTaxonomyId, created.id)
  }

  const categoryIdBySourceTermId = new Map<number, string>()

  for (const category of categories) {
    const id = idBySourceTaxonomyId.get(category.sourceTaxonomyId)
    if (id) categoryIdBySourceTermId.set(category.sourceTermId, id)
  }

  for (const category of categories) {
    if (!category.parentSourceTermId) continue

    const childId = idBySourceTaxonomyId.get(category.sourceTaxonomyId)
    const parentId = categoryIdBySourceTermId.get(category.parentSourceTermId)

    if (!childId || !parentId) continue

    await payload.update({
      id: childId,
      collection: 'categories',
      data: {
        parent: parentId,
      },
      overrideAccess: true,
    })
  }

  return idBySourceTaxonomyId
}

async function upsertBrands(
  payload: Awaited<ReturnType<typeof getPayload>>,
  brands: NormalizedBrand[],
  existing: ExistingBrand[],
): Promise<Map<number, string>> {
  const idBySourceTaxonomyId = new Map<number, string>()
  const existingBySourceTaxonomyId = new Map<number, ExistingBrand>()

  for (const item of existing) {
    if (typeof item.sourceTaxonomyId === 'number') {
      existingBySourceTaxonomyId.set(item.sourceTaxonomyId, item)
      idBySourceTaxonomyId.set(item.sourceTaxonomyId, item.id)
    }
  }

  for (const brand of brands) {
    const existingBrand = existingBySourceTaxonomyId.get(brand.sourceTaxonomyId)
    const data = {
      productCount: brand.productCount,
      slug: brand.slug,
      sourceTaxonomyId: brand.sourceTaxonomyId,
      sourceTermId: brand.sourceTermId,
      title: brand.title,
    }

    if (existingBrand) {
      await payload.update({
        id: existingBrand.id,
        collection: 'brands',
        data,
        overrideAccess: true,
      })
      idBySourceTaxonomyId.set(brand.sourceTaxonomyId, existingBrand.id)
      continue
    }

    const created = await payload.create({
      collection: 'brands',
      data,
      overrideAccess: true,
    })

    idBySourceTaxonomyId.set(brand.sourceTaxonomyId, created.id)
  }

  return idBySourceTaxonomyId
}

async function upsertProducts(
  payload: Awaited<ReturnType<typeof getPayload>>,
  {
    batchSize,
    brandIdBySourceTaxonomyId,
    categoryIdBySourceTaxonomyId,
    existingProducts,
    failedProducts,
    products,
  }: {
    batchSize: number
    brandIdBySourceTaxonomyId: Map<number, string>
    categoryIdBySourceTaxonomyId: Map<number, string>
    existingProducts: ExistingProduct[]
    failedProducts: ProductImportFailure[]
    products: NormalizedProduct[]
  },
): Promise<void> {
  const existingBySourceId = new Map<number, ExistingProduct>()
  const existingBySku = new Map<string, ExistingProduct>()

  for (const product of existingProducts) {
    if (typeof product.sourceId === 'number') existingBySourceId.set(product.sourceId, product)

    const sku = normalizeSku(product.sku)
    if (sku && !existingBySku.has(sku)) existingBySku.set(sku, product)
  }

  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize)

    for (const product of batch) {
      const existingProduct = existingBySourceId.get(product.sourceId) || existingBySku.get(normalizeSku(product.sku))
      const commonData = buildWooCommerceContentData({
        brandIdBySourceTaxonomyId,
        categoryIdBySourceTaxonomyId,
        existingProduct,
        product,
      })

      try {
        if (existingProduct) {
          await withRetry(() =>
            payload.update({
              id: existingProduct.id,
              collection: 'products',
              data: commonData,
              draft: false,
              overrideAccess: true,
            }),
          )

          existingBySourceId.set(product.sourceId, {
            ...existingProduct,
            legacyProductUrl: commonData.legacyProductUrl,
            sku: product.sku,
            sourceId: product.sourceId,
          })
          continue
        }

        const data = {
          ...commonData,
          backordersAllowed: product.backordersAllowed,
          inventory: product.stockQty,
          manageStock: product.manageStock,
          price: product.price,
          priceGroup1: product.price,
          priceInUSD: product.price,
          priceRetail: product.price,
          priceWholesale: product.price,
          published: product.published,
          stockQty: product.stockQty,
          stockStatus: product.stockStatus,
        }

        const created = await withRetry(() =>
          payload.create({
            collection: 'products',
            data,
            draft: false,
            overrideAccess: true,
          }),
        )

        existingBySourceId.set(product.sourceId, {
          id: created.id,
          legacyProductUrl: created.legacyProductUrl,
          sku: created.sku,
          slug: created.slug,
          sourceId: created.sourceId,
        })
        if (created.sku) existingBySku.set(normalizeSku(created.sku), {
          id: created.id,
          legacyProductUrl: created.legacyProductUrl,
          sku: created.sku,
          slug: created.slug,
          sourceId: created.sourceId,
        })
      } catch (error) {
        const preview = (product.description || '').replace(/\s+/g, ' ').slice(0, 300)
        const failure = {
          batchStart: index,
          brandSourceTaxonomyIds: product.brandSourceTaxonomyIds,
          categorySourceTaxonomyIds: product.categorySourceTaxonomyIds,
          descriptionPreview: preview,
          error: extractErrorMessage(error),
          existingProductId: existingProduct?.id || null,
          productSlug: product.slug,
          sourceId: product.sourceId,
          title: product.title,
        } satisfies ProductImportFailure

        failedProducts.push(failure)

        console.error(
          JSON.stringify(failure, null, 2),
        )
      }
    }
  }
}

function buildWooCommerceContentData({
  brandIdBySourceTaxonomyId,
  categoryIdBySourceTaxonomyId,
  existingProduct,
  product,
}: {
  brandIdBySourceTaxonomyId: Map<number, string>
  categoryIdBySourceTaxonomyId: Map<number, string>
  existingProduct?: ExistingProduct
  product: NormalizedProduct
}) {
  return {
    brand: product.brandSourceTaxonomyIds
      .map((sourceTaxonomyId) => brandIdBySourceTaxonomyId.get(sourceTaxonomyId))
      .filter((value): value is string => Boolean(value)),
    categories: product.categorySourceTaxonomyIds
      .map((sourceTaxonomyId) => categoryIdBySourceTaxonomyId.get(sourceTaxonomyId))
      .filter((value): value is string => Boolean(value)),
    description: product.description,
    images: product.images,
    imagesMigrated: product.imagesMigrated,
    legacyAttachmentIDs: product.legacyAttachmentIDs,
    legacyModifiedAt: product.legacyModifiedAt,
    legacyProductUrl: chooseLegacyProductUrl(existingProduct?.legacyProductUrl, product),
    manufacturerCode: product.manufacturerCode,
    originalSku: product.originalSku,
    shortDescription: product.shortDescription,
    sku: product.sku,
    slug: product.slug,
    sourceId: product.sourceId,
    title: product.title,
  }
}

async function unpublishProductsMissingFromDump(
  payload: Awaited<ReturnType<typeof getPayload>>,
  existingProducts: ExistingProduct[],
  products: NormalizedProduct[],
): Promise<number> {
  const dumpSourceIds = new Set(products.map((product) => product.sourceId))
  const dumpSkus = new Set(products.map((product) => normalizeSku(product.sku)).filter(Boolean))
  let unpublished = 0

  for (const product of existingProducts) {
    const hasSourceIdMatch = typeof product.sourceId === 'number' && dumpSourceIds.has(product.sourceId)
    const hasSkuMatch = Boolean(normalizeSku(product.sku) && dumpSkus.has(normalizeSku(product.sku)))

    if (hasSourceIdMatch || hasSkuMatch) continue

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

  return unpublished
}

function chooseLegacyProductUrl(existingUrl: null | string | undefined, product: NormalizedProduct): string | undefined {
  if (existingUrl && !isQueryProductUrl(existingUrl)) return existingUrl
  if (product.legacyProductUrl && !isQueryProductUrl(product.legacyProductUrl)) return product.legacyProductUrl
  return buildCanonicalLegacyProductUrl(product)
}

function isQueryProductUrl(value: string): boolean {
  return value.includes('post_type=product') || value.includes('?p=')
}

function buildCanonicalLegacyProductUrl(product: NormalizedProduct): string | undefined {
  if (!product.slug) return product.legacyProductUrl
  return `https://nikelectric.com/product/${product.slug}/`
}

function normalizeSku(value: null | string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
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

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function fetchAll<T extends { id: string }>({
  collection,
  payload,
  select,
}: {
  collection: 'brands' | 'categories' | 'products'
  payload: Awaited<ReturnType<typeof getPayload>>
  select: Record<string, true>
}): Promise<T[]> {
  const docs: T[] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const result = await payload.find({
      collection,
      depth: 0,
      limit: 200,
      overrideAccess: true,
      page,
      pagination: true,
      select,
    })

    docs.push(...(result.docs as unknown as T[]))
    hasNextPage = result.hasNextPage
    page += 1
  }

  return docs
}
