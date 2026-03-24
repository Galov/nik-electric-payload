import { Grid } from '@/components/Grid'
import { ProductGridItem } from '@/components/ProductGridItem'
import { CatalogPagination } from '@/components/layout/search/CatalogPagination'
import { Search } from '@/components/Search'
import { SortToolbar } from '@/components/layout/search/SortToolbar'
import { ShopBanner } from '@/components/shop/ShopBanner'
import { generateMeta } from '@/utilities/generateMeta'
import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'
import React from 'react'

type SearchParams = { [key: string]: string | string[] | undefined }

type Props = {
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { brand, category, limit, page, q, sort } = await searchParams
  const hasFilters = Boolean(brand || category || limit || page || q || sort)

  const metadata = await generateMeta({
    fallbackDescription: 'Разгледайте продуктите в каталога.',
    fallbackTitle: 'Каталог',
    path: '/shop',
  })

  return {
    ...metadata,
    robots: {
      follow: true,
      googleBot: {
        follow: true,
        index: !hasFilters,
      },
      index: !hasFilters,
    },
  }
}

export default async function ShopPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const { brand, category, limit: rawLimit, page: rawPage, q: rawSearchValue, sort } =
    resolvedSearchParams
  const searchValue = String(rawSearchValue || '').trim()
  const searchTerms = tokenizeSearchTerms(searchValue)
  const pageSize = normalizePageSize(rawLimit)
  const currentPage = normalizeCurrentPage(rawPage)
  const payload = await getPayload({ config: configPromise })
  const shopPage = await payload.findGlobal({
    slug: 'shopPage',
    depth: 1,
  })
  const selectedBrandID = brand ? await getBrandIDForFilter(payload, String(brand)) : null
  const categoryIDs = category ? await getCategoryIDsForFilter(payload, String(category)) : null
  const searchClauses = searchTerms.length > 0 ? await getSearchClauses(payload, searchTerms) : []

  const products = await payload.find({
    collection: 'products',
    draft: false,
    limit: pageSize,
    overrideAccess: false,
    page: currentPage,
    pagination: true,
    select: {
      inventory: true,
      manufacturerCode: true,
      published: true,
      stockQty: true,
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
        ...searchClauses,
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
                  equals: selectedBrandID || String(brand),
                },
              },
            ]
          : []),
      ],
    },
  })

  const resultsText = products.totalDocs > 1 ? 'резултата' : 'резултат'
  const hasActiveFilters = Boolean(searchValue || category || brand)
  const paginationSearchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value === undefined) continue

    if (Array.isArray(value)) {
      for (const item of value) {
        paginationSearchParams.append(key, item)
      }

      continue
    }

    paginationSearchParams.set(key, value)
  }

  const availableBrands = Array.from(
    new Map(
      products.docs
        .flatMap((product) => {
          if (!product.brand || typeof product.brand === 'string') return []

          return [
            {
              id: product.brand.id,
              slug: product.brand.slug || String(product.brand.id),
              title: product.brand.title,
            },
          ]
        })
        .map((availableBrand) => [availableBrand.slug, availableBrand]),
    ).values(),
  )

  return (
    <div>
      <section className="mb-6 rounded-[6px] bg-[rgb(250,251,253)] px-4 py-5 md:px-5 md:py-6">
        <Search
          availableBrands={availableBrands}
          showBrandFilter={Boolean(searchValue) && products.docs.length > 0}
        />

        {searchValue ? (
          <div className="pt-5">
            <p className="text-sm leading-7 text-[rgb(0,126,229)]">
              {products.docs?.length === 0
                ? 'Няма продукти, които съвпадат с избраните критерии.'
                : `Намерихме ${products.totalDocs} ${resultsText} за избраните критерии.`}
            </p>
          </div>
        ) : null}

        {!hasActiveFilters && products.docs?.length === 0 ? (
          <div className="pt-5">
            <p className="text-sm leading-7 text-primary/62">
              Няма намерени продукти. Опитай с други филтри.
            </p>
          </div>
        ) : null}

        {hasActiveFilters && products.docs?.length === 0 ? (
          <div className="pt-5">
            <p className="text-sm leading-7 text-primary/62">
              Няма намерени продукти по избраната комбинация от филтри.
            </p>
          </div>
        ) : null}

        {products?.docs.length > 0 ? <SortToolbar pageSize={pageSize} /> : null}
      </section>

      {products?.docs.length > 0 ? (
        <>
          <Grid className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.docs.map((product) => {
              return <ProductGridItem key={product.id} product={product} />
            })}
          </Grid>
          <CatalogPagination
            currentPage={products.page ?? currentPage}
            searchParams={paginationSearchParams}
            totalPages={products.totalPages}
          />
          <ShopBanner banner={shopPage?.bottomBanner} className="mt-8" />
        </>
      ) : null}
    </div>
  )
}

const tokenizeSearchTerms = (value: string) =>
  value
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)

const normalizePageSize = (value: string | string[] | undefined): number => {
  const rawValue = Array.isArray(value) ? value[0] : value

  const allowedValues = new Set([8, 16, 24, 48, 96])
  const numericValue = Number(rawValue)

  if (allowedValues.has(numericValue)) {
    return numericValue
  }

  return 16
}

const normalizeCurrentPage = (value: string | string[] | undefined) => {
  const rawValue = Array.isArray(value) ? value[0] : value
  const numericValue = Number(rawValue)

  if (Number.isInteger(numericValue) && numericValue > 0) {
    return numericValue
  }

  return 1
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

const getBrandIDForFilter = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  brandValue: string,
) => {
  const brands = await payload.find({
    collection: 'brands',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: {
      or: [
        {
          slug: {
            equals: brandValue,
          },
        },
        {
          id: {
            equals: brandValue,
          },
        },
      ],
    },
  })

  return brands.docs[0]?.id || null
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

const getSearchClauses = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  searchTerms: string[],
) => {
  return Promise.all(
    searchTerms.map(async (term) => {
      const [brandIDs, searchCategoryIDs] = await Promise.all([
        getMatchingBrandIDs(payload, term),
        getMatchingCategoryIDs(payload, term),
      ])

      const orClauses: Where[] = [
        {
          title: {
            like: term,
          },
        },
        {
          description: {
            like: term,
          },
        },
        {
          sku: {
            like: term,
          },
        },
        {
          originalSku: {
            like: term,
          },
        },
        {
          manufacturerCode: {
            like: term,
          },
        },
      ]

      if (brandIDs.length > 0) {
        orClauses.push({
          brand: {
            in: brandIDs,
          },
        })
      }

      if (searchCategoryIDs.length > 0) {
        orClauses.push({
          categories: {
            in: searchCategoryIDs,
          },
        })
      }

      return {
        or: orClauses,
      }
    }),
  )
}
