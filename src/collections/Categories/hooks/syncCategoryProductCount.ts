import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Payload,
} from 'payload'

type CategoryNode = {
  id: string
  parent?: null | string
  productCount?: null | number
}

type ProductNode = {
  id: string
  categories?: Array<{ id?: string } | string> | null
}

export const SKIP_CATEGORY_PRODUCT_COUNT_SYNC = 'skipCategoryProductCountSync'

const normalizeRelationshipID = (value: unknown) => {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }

  return null
}

const loadCategories = async (payload: Payload): Promise<CategoryNode[]> => {
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: {
      parent: true,
      productCount: true,
    },
  })

  return result.docs.map((doc) => ({
    id: doc.id,
    parent: normalizeRelationshipID(doc.parent),
    productCount: typeof doc.productCount === 'number' ? doc.productCount : 0,
  }))
}

const loadPublishedProducts = async (payload: Payload): Promise<ProductNode[]> => {
  const result = await payload.find({
    collection: 'products',
    depth: 0,
    draft: false,
    limit: 20000,
    overrideAccess: true,
    pagination: false,
    select: {
      categories: true,
    },
    where: {
      and: [
        {
          published: {
            equals: true,
          },
        },
        {
          stockQty: {
            greater_than: 0,
          },
        },
      ],
    },
  })

  return result.docs.map((doc) => ({
    categories: doc.categories,
    id: doc.id,
  }))
}

export const syncCategoryProductCount = async (payload: Payload) => {
  const categories = await loadCategories(payload)
  const products = await loadPublishedProducts(payload)
  const categoryByID = new Map(categories.map((category) => [category.id, category]))
  const productIDsByCategoryID = new Map<string, Set<string>>()

  const addProductToCategoryAndParents = (categoryID: string, productID: string) => {
    let currentID: null | string = categoryID
    const visited = new Set<string>()

    while (currentID && categoryByID.has(currentID) && !visited.has(currentID)) {
      visited.add(currentID)

      const existing = productIDsByCategoryID.get(currentID) || new Set<string>()
      existing.add(productID)
      productIDsByCategoryID.set(currentID, existing)

      currentID = categoryByID.get(currentID)?.parent || null
    }
  }

  for (const product of products) {
    if (!Array.isArray(product.categories)) continue

    const categoryIDs = new Set(
      product.categories
        .map((category) => normalizeRelationshipID(category))
        .filter((categoryID): categoryID is string => Boolean(categoryID)),
    )

    for (const categoryID of categoryIDs) {
      addProductToCategoryAndParents(categoryID, product.id)
    }
  }

  const updates = categories
    .map((category) => {
      const productCount = productIDsByCategoryID.get(category.id)?.size || 0

      if ((category.productCount || 0) === productCount) {
        return null
      }

      return {
        id: category.id,
        productCount,
      }
    })
    .filter((update): update is { id: string; productCount: number } => Boolean(update))

  for (const update of updates) {
    await payload.update({
      collection: 'categories',
      id: update.id,
      data: {
        productCount: update.productCount,
      },
      depth: 0,
      overrideAccess: true,
      context: {
        skipCategoryAdminMetaSync: true,
        [SKIP_CATEGORY_PRODUCT_COUNT_SYNC]: true,
      },
    })
  }
}

export const syncCategoryProductCountAfterCategoryChange: CollectionAfterChangeHook = async ({
  req,
  doc,
}) => {
  if (req.context?.[SKIP_CATEGORY_PRODUCT_COUNT_SYNC]) {
    return doc
  }

  await syncCategoryProductCount(req.payload)

  return doc
}

export const syncCategoryProductCountAfterCategoryDelete: CollectionAfterDeleteHook = async ({
  req,
  doc,
}) => {
  if (req.context?.[SKIP_CATEGORY_PRODUCT_COUNT_SYNC]) {
    return doc
  }

  await syncCategoryProductCount(req.payload)

  return doc
}

const serializeCategoryIDs = (value: unknown) => {
  if (!Array.isArray(value)) return ''

  return value
    .map((category) => normalizeRelationshipID(category))
    .filter(Boolean)
    .sort()
    .join('|')
}

export const syncCategoryProductCountAfterProductChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (req.context?.[SKIP_CATEGORY_PRODUCT_COUNT_SYNC]) {
    return doc
  }

  const categoriesChanged =
    serializeCategoryIDs(doc.categories) !== serializeCategoryIDs(previousDoc?.categories)
  const publishedChanged = doc.published !== previousDoc?.published
  const stockChanged = doc.stockQty !== previousDoc?.stockQty

  if (operation === 'create' || categoriesChanged || publishedChanged || stockChanged) {
    await syncCategoryProductCount(req.payload)
  }

  return doc
}

export const syncCategoryProductCountAfterProductDelete: CollectionAfterDeleteHook = async ({
  req,
  doc,
}) => {
  if (req.context?.[SKIP_CATEGORY_PRODUCT_COUNT_SYNC]) {
    return doc
  }

  await syncCategoryProductCount(req.payload)

  return doc
}
