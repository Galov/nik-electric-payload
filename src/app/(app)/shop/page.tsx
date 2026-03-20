import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

export const metadata = {
  description: 'Разгледайте продуктите в каталога.',
  title: 'Каталог',
}

type SearchParams = { [key: string]: string | string[] | undefined }

type Props = {
  searchParams: Promise<SearchParams>
}

export default async function ShopPage({ searchParams }: Props) {
  const { brand, category, q: rawSearchValue, sort } = await searchParams
  const searchValue = String(rawSearchValue || '').trim()
  const payload = await getPayload({ config: configPromise })
  const categoryIDs = category ? await getCategoryIDsForFilter(payload, String(category)) : null
  const brandIDs = searchValue ? await getMatchingBrandIDs(payload, searchValue) : []
  const searchCategoryIDs =
    searchValue && !category ? await getMatchingCategoryIDs(payload, searchValue) : []

  const products = await payload.find({
    collection: 'products',
    draft: false,
    limit: 20,
    overrideAccess: false,
    select: {
      images: true,
      price: true,
      title: true,
      slug: true,
      categories: true,
      brand: true,
      sku: true,
    },
    ...(sort ? { sort } : { sort: '-updatedAt' }),
    where: {
      and: [
        {
          published: {
            equals: true,
          },
        },
        ...(searchValue
          ? [
              {
                or: [
                  {
                    title: {
                      like: searchValue,
                    },
                  },
                  {
                    description: {
                      like: searchValue,
                    },
                  },
                  {
                    sku: {
                      like: searchValue,
                    },
                  },
                  {
                    originalSku: {
                      like: searchValue,
                    },
                  },
                  {
                    manufacturerCode: {
                      like: searchValue,
                    },
                  },
                  ...(brandIDs.length > 0
                    ? [
                        {
                          brand: {
                            in: brandIDs,
                          },
                        },
                      ]
                    : []),
                  ...(searchCategoryIDs.length > 0
                    ? [
                        {
                          categories: {
                            in: searchCategoryIDs,
                          },
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
        ...(category
          ? [
              {
                categories: {
                  in: categoryIDs || [String(category)],
                },
              },
            ]
          : []),
        ...(brand
          ? [
              {
                brand: {
                  equals: String(brand),
                },
              },
            ]
          : []),
      ],
    },
  })

  const resultsText = products.docs.length > 1 ? 'резултата' : 'резултат'
  const hasActiveFilters = Boolean(searchValue || category || brand)

  return (
    <div>
      {searchValue ? (
        <p className="mb-4">
          {products.docs?.length === 0
            ? 'Няма продукти, които съвпадат с избраните критерии.'
            : `Показваме ${products.docs.length} ${resultsText} за избраните критерии.`}
        </p>
      ) : null}

      {!hasActiveFilters && products.docs?.length === 0 && (
        <p className="mb-4">Няма намерени продукти. Опитай с други филтри.</p>
      )}

      {hasActiveFilters && products.docs?.length === 0 && (
        <p className="mb-4">Няма намерени продукти по избраната комбинация от филтри.</p>
      )}

      {products?.docs.length > 0 ? (
        <Grid className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.docs.map((product) => {
            return <ProductGridItem key={product.id} product={product} />
          })}
        </Grid>
      ) : null}
    </div>
  )
}

const getCategoryIDsForFilter = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  selectedCategoryID: string,
) => {
  const categories = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1000,
    pagination: false,
    select: {
      parent: true,
    },
  })

  const childrenByParentID = new Map<string, string[]>()

  for (const category of categories.docs) {
    if (typeof category.parent !== 'string') continue

    const existingChildren = childrenByParentID.get(category.parent) || []
    existingChildren.push(category.id)
    childrenByParentID.set(category.parent, existingChildren)
  }

  const ids = new Set<string>([selectedCategoryID])
  const queue = [selectedCategoryID]

  while (queue.length > 0) {
    const currentID = queue.shift()

    if (!currentID) continue

    for (const childID of childrenByParentID.get(currentID) || []) {
      if (ids.has(childID)) continue
      ids.add(childID)
      queue.push(childID)
    }
  }

  return [...ids]
}

const getMatchingBrandIDs = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  searchValue: string,
) => {
  const brands = await payload.find({
    collection: 'brands',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
    where: {
      title: {
        like: searchValue,
      },
    },
  })

  return brands.docs.map((brand) => brand.id)
}

const getMatchingCategoryIDs = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  searchValue: string,
) => {
  const categories = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
    where: {
      title: {
        like: searchValue,
      },
    },
  })

  return categories.docs.map((category) => category.id)
}
