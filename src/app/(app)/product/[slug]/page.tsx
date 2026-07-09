import { Gallery } from '@/components/product/Gallery'
import { ProductDescription } from '@/components/product/ProductDescription'
import { RecentlyViewedProducts } from '@/components/product/RecentlyViewedProducts'
import { RelatedProducts } from '@/components/product/RelatedProducts'
import { buildCategoryPath } from '@/utilities/category'
import { generateMeta } from '@/utilities/generateMeta'
import {
  formatProductTitle,
  getAvailableProductQuantity,
  getProductBrands,
  getProductPrimaryImage,
  getProductSEODescription,
  PRODUCT_IMAGE_PLACEHOLDER_URL,
} from '@/utilities/product'
import {
  buildBreadcrumbSchema,
  buildProductBreadcrumbItems,
  buildProductSchema,
} from '@/utilities/schema'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import React, { Suspense } from 'react'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{
    slug: string
  }>
}

type ProductCategoryBreadcrumbItem = {
  parent?: null | ProductCategoryBreadcrumbItem | string
  slug?: null | string
  title?: null | string
}

const buildProductCategoryBreadcrumb = (category?: null | ProductCategoryBreadcrumbItem) => {
  const chain: ProductCategoryBreadcrumbItem[] = []
  let current = category

  while (current && typeof current !== 'string' && current.slug && current.title) {
    chain.unshift(current)
    current = current.parent && typeof current.parent !== 'string' ? current.parent : null
  }

  return chain
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const product = await queryProductBySlug({ slug })

  if (!product) return notFound()
  const formattedProductTitle = formatProductTitle(product.title)

  const primaryImage = getProductPrimaryImage(product)
  const metadata = await generateMeta({
    doc: {
      ...(product as object),
      meta:
        (product as { meta?: unknown }).meta ||
        (primaryImage?.url
          ? {
              image: {
                alt: primaryImage.alt,
                url: primaryImage.url,
              },
            }
          : undefined),
    },
    fallbackDescription: getProductSEODescription(product),
    fallbackTitle: product.title,
    path: `/product/${slug}`,
  })

  return {
    ...metadata,
    robots: {
      follow: true,
      googleBot: {
        follow: true,
        index: true,
      },
      index: true,
    },
  }
}

export default async function ProductPage({ params }: Args) {
  const { slug } = await params
  const product = await queryProductBySlug({ slug })

  if (!product) return notFound()
  const formattedProductTitle = formatProductTitle(product.title)

  const primaryCategory =
    product.categories?.find(
      (category): category is Exclude<(typeof product.categories)[number], string> =>
        Boolean(category && typeof category !== 'string' && category.slug && category.title),
    ) || null
  const categoryBreadcrumb = buildProductCategoryBreadcrumb(primaryCategory)

  const relatedProducts = await queryRelatedProducts({
    categoryIDs:
      product.categories
        ?.map((category) => (category && typeof category !== 'string' ? category.id : category))
        .filter(Boolean) || [],
    productID: product.id,
  })

  const productJsonLd = {
    ...buildProductSchema({
      brand: getProductBrands(product)[0]?.title || null,
      category: primaryCategory,
      description: getProductSEODescription(product),
      image: getProductPrimaryImage(product)?.url,
      inStock: getAvailableProductQuantity(product) > 0,
      name: formattedProductTitle,
      price: product.price,
      sku: product.sku,
      slug,
    }),
  }
  const breadcrumbJsonLd = buildBreadcrumbSchema(
    buildProductBreadcrumbItems({
      category: primaryCategory,
      productName: formattedProductTitle,
      productSlug: slug,
    }),
  )

  return (
    <React.Fragment>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <div className="container pt-8 pb-8">
        <div className="mb-3">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-primary/55">
            <Link className="transition hover:text-primary/80" href="/shop">
              Каталог
            </Link>
            {categoryBreadcrumb.map((category) => (
              <React.Fragment key={category.slug}>
                <span>/</span>
                <Link
                  className="transition hover:text-primary/80"
                  href={buildCategoryPath(category)}
                >
                  {category.title}
                </Link>
              </React.Fragment>
            ))}
            <span>/</span>
            <span className="text-primary/80">{formattedProductTitle}</span>
          </nav>
        </div>
        <div className="flex flex-col gap-12 py-4 lg:flex-row lg:gap-10">
          <div className="h-full w-full basis-full lg:basis-1/2">
            <Suspense
              fallback={
                <div className="relative aspect-square h-full max-h-[550px] w-full overflow-hidden" />
              }
            >
              <Gallery
                gallery={
                  product.images && product.images.length > 0
                    ? product.images
                    : [{ alt: formattedProductTitle, legacyUrl: PRODUCT_IMAGE_PLACEHOLDER_URL }]
                }
                productTitle={formattedProductTitle}
              />
            </Suspense>
          </div>

          <div className="basis-full lg:basis-1/2">
            <ProductDescription product={product} />
          </div>
        </div>

        <RecentlyViewedProducts
          product={{
            categories: product.categories,
            id: product.id,
            images: product.images,
            inventory: product.inventory,
            manufacturerCode: product.manufacturerCode,
            originalSku: product.originalSku,
            priceGroup1: (product as typeof product & { priceGroup1?: number | null }).priceGroup1,
            priceWholesale: (product as typeof product & { priceWholesale?: number | null })
              .priceWholesale,
            published: product.published,
            slug: product.slug,
            sku: product.sku,
            stockQty: product.stockQty,
            title: formattedProductTitle,
          }}
        />

        <RelatedProducts products={relatedProducts} />
      </div>
    </React.Fragment>
  )
}

const queryProductBySlug = async ({ slug }: { slug: string }) => {
  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'products',
    depth: 10,
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
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

  return result.docs?.[0] || null
}

const queryRelatedProducts = async ({
  categoryIDs,
  productID,
}: {
  categoryIDs: string[]
  productID: string
}) => {
  if (categoryIDs.length === 0) return []

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'products',
    depth: 1,
    draft: false,
    limit: 5,
    overrideAccess: false,
    pagination: false,
    select: {
      categories: true,
      images: true,
      inventory: true,
      manufacturerCode: true,
      originalSku: true,
      price: true,
      priceGroup1: true,
      priceWholesale: true,
      published: true,
      slug: true,
      sku: true,
      stockQty: true,
      title: true,
    },
    sort: '-updatedAt',
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
        {
          id: {
            not_equals: productID,
          },
        },
        {
          categories: {
            in: categoryIDs,
          },
        },
      ],
    },
  })

  return result.docs
}
