'use client'
import type { Product } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Media } from '@/components/Media'
import { Price } from '@/components/Price'
import { ManufacturerBadge } from '@/components/product/ManufacturerBadge'
import { ProductTypeBadge } from '@/components/product/ProductTypeBadge'
import Link from 'next/link'
import React, { Suspense } from 'react'
import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'
import { buildCategoryPath } from '@/utilities/category'
import {
  formatProductTitle,
  getAvailableProductQuantity,
  getProductBrands,
  getProductType,
} from '@/utilities/product'

type ProductCategoryLink = {
  parent?: null | ProductCategoryLink
  slug?: null | string
  title: string
}

export function ProductDescription({ product }: { product: Product }) {
  const description = formatLegacyProductDescription(product.description)
  const stockQuantity = getAvailableProductQuantity(product)
  const manufacturerCode = product.manufacturerCode?.trim() || null
  const categories = (product.categories || []).reduce<ProductCategoryLink[]>((acc, category) => {
    if (!category || typeof category === 'string' || !category.title) return acc

    acc.push(category as ProductCategoryLink)

    return acc
  }, [])
  const brands = getProductBrands(product)
  const brandsWithLogos = brands.filter((brand) => brand.logo)
  const productType = getProductType(product)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex min-h-7 flex-wrap gap-2">
            {manufacturerCode ? (
              <ManufacturerBadge className="self-start" value={manufacturerCode} />
            ) : null}
            {productType ? <ProductTypeBadge className="self-start" value={productType} /> : null}
          </div>
          <h1 className="text-xl font-normal leading-tight text-[rgb(0,126,229)] lg:text-2xl">
            {formatProductTitle(product.title)}
          </h1>
        </div>
        <div className="pt-1 text-base font-normal text-primary/60 lg:pt-2 lg:text-lg">
          <Price
            amount={0}
            priceGroup1={(product as Product & { priceGroup1?: number | null }).priceGroup1}
            priceWholesale={
              (product as Product & { priceWholesale?: number | null }).priceWholesale
            }
          />
        </div>
      </div>
      <div className="grid gap-1.5 text-sm leading-6">
        {product.sku ? (
          <p>
            <span className="text-muted-foreground/70">Код:</span>{' '}
            <span className="font-semibold text-primary">{product.sku}</span>
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
            <span className="text-muted-foreground/70">Вид производител:</span>{' '}
            <span className="font-normal text-primary/80">{manufacturerCode}</span>
          </p>
        ) : null}
        <p>
          <span className="text-muted-foreground/70">Наличност:</span>{' '}
          <span className="font-bold text-primary/80">
            {stockQuantity > 0 ? stockQuantity : 'Изчерпана наличност'}
          </span>
        </p>
        {brandsWithLogos.length > 0 ? (
          <div className="pt-2">
            <div className="flex flex-wrap gap-3">
              {brandsWithLogos.map((brand) => (
                <div
                  key={brand.id || brand.slug || brand.title}
                  className="flex h-24 w-24 items-center justify-center overflow-hidden"
                >
                  <div className="relative flex h-full w-full items-center justify-center">
                    <Media
                      alt={`Лого на ${brand.title}`}
                      className="flex h-full w-full items-center justify-center"
                      imgClassName="h-full w-full object-contain"
                      resource={brand.logo!}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
