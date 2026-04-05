'use client'
import type { Product } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import { ManufacturerBadge } from '@/components/product/ManufacturerBadge'
import { ProductTypeBadge } from '@/components/product/ProductTypeBadge'
import Link from 'next/link'
import React, { Suspense } from 'react'
import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'
import { buildCategoryPath } from '@/utilities/category'
import { getProductBrands, getProductType } from '@/utilities/product'

type ProductCategoryLink = {
  parent?: null | ProductCategoryLink
  slug?: null | string
  title: string
}

export function ProductDescription({ product }: { product: Product }) {
  const description = formatLegacyProductDescription(product.description || product.shortDescription)
  const stockQuantity = product.inventory || 0
  const manufacturerCode = product.manufacturerCode || null
  const productType = getProductType(product)
  const categories = (product.categories || []).reduce<ProductCategoryLink[]>((acc, category) => {
    if (!category || typeof category === 'string' || !category.title) return acc

    acc.push(category as ProductCategoryLink)

    return acc
  }, [])
  const brands = getProductBrands(product)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex min-h-7 flex-wrap gap-2">
            {manufacturerCode ? <ManufacturerBadge className="self-start" value={manufacturerCode} /> : null}
            {productType ? <ProductTypeBadge className="self-start" value={productType} /> : null}
          </div>
          <h1 className="text-xl font-normal leading-tight text-[rgb(0,126,229)] lg:text-2xl">
            {product.title}
          </h1>
        </div>
        <div className="text-base font-normal text-primary/60 lg:text-lg">
          <Price
            amount={0}
            priceGroup1={(product as Product & { priceGroup1?: number | null }).priceGroup1}
            priceWholesale={(product as Product & { priceWholesale?: number | null }).priceWholesale}
          />
        </div>
      </div>
      <div className="grid gap-1.5 text-sm leading-6">
        {product.sku ? (
          <p>
            <span className="text-muted-foreground/70">Код:</span>{' '}
            <span className="font-normal text-primary/80">{product.sku}</span>
          </p>
        ) : null}
        {categories.length > 0 ? (
          <p>
            <span className="text-muted-foreground/70">Категория:</span>{' '}
            <span className="font-normal text-primary/80">
              {categories.map((category, index) => (
                <React.Fragment key={`${category.slug || category.title}-${index}`}>
                  {index > 0 ? ', ' : null}
                  {category.slug ? (
                    <Link
                      className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]"
                      href={buildCategoryPath(category)}
                    >
                      {category.title}
                    </Link>
                  ) : (
                    category.title
                  )}
                </React.Fragment>
              ))}
            </span>
          </p>
        ) : null}
        {brands.length > 0 ? (
          <p>
            <span className="text-muted-foreground/70">Съвместим с марки:</span>{' '}
            <span className="font-normal text-primary/80">
              {brands.map((brand, index) => (
                <React.Fragment key={`${brand.id || brand.slug || brand.title}-${index}`}>
                  {index > 0 ? ', ' : null}
                  {brand.title}
                </React.Fragment>
              ))}
            </span>
          </p>
        ) : null}
        {product.originalSku ? (
          <p>
            <span className="text-muted-foreground/70">Оригинален код:</span>{' '}
            <span className="font-normal text-primary/80">{product.originalSku}</span>
          </p>
        ) : null}
        {manufacturerCode ? (
          <p>
            <span className="text-muted-foreground/70">Производител:</span>{' '}
            <span className="font-normal text-primary/80">{manufacturerCode}</span>
          </p>
        ) : null}
        <p>
          <span className="text-muted-foreground/70">Наличност:</span>{' '}
          <span className="font-normal text-primary/80">
            {stockQuantity > 0 ? stockQuantity : 'Изчерпана наличност'}
          </span>
        </p>
        {productType === 'removed-from-unit' ? (
          <p>
            <span className="text-muted-foreground/70">Състояние:</span>{' '}
            <span className="font-normal text-emerald-700">
              Оригинална неизползвана част, демонтирана от нов уред.
            </span>
          </p>
        ) : null}
      </div>
      {description ? (
        <div className="border-y border-[rgb(0,126,229)]/35 py-5 whitespace-pre-line text-sm leading-7 text-primary/65">
          {description}
        </div>
      ) : null}
      <div className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <Suspense fallback={null}>
            <AddToCart product={product} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
