'use client'
import type { Product } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import { RefurbishedBadge } from '@/components/product/RefurbishedBadge'
import Link from 'next/link'
import React, { Suspense } from 'react'
import { StockIndicator } from '@/components/product/StockIndicator'
import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'
import { buildCategoryPath } from '@/utilities/category'

type ProductCategoryLink = {
  parent?: null | ProductCategoryLink
  slug?: null | string
  title: string
}

export function ProductDescription({ product }: { product: Product }) {
  const description = formatLegacyProductDescription(product.description || product.shortDescription)
  const categories = (product.categories || []).reduce<ProductCategoryLink[]>((acc, category) => {
    if (!category || typeof category === 'string' || !category.title) return acc

    acc.push(category as ProductCategoryLink)

    return acc
  }, [])
  const brand = product.brand && typeof product.brand !== 'string' ? product.brand.title : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4">
          {product.isRefurbished ? <RefurbishedBadge className="self-start" /> : null}
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
        {brand ? (
          <p>
            <span className="text-muted-foreground/70">Марка:</span>{' '}
            <span className="font-normal text-primary/80">{brand}</span>
          </p>
        ) : null}
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
        {product.originalSku ? (
          <p>
            <span className="text-muted-foreground/70">Оригинален код:</span>{' '}
            <span className="font-normal text-primary/80">{product.originalSku}</span>
          </p>
        ) : null}
        {product.manufacturerCode ? (
          <p>
            <span className="text-muted-foreground/70">Производител:</span>{' '}
            <span className="font-normal text-primary/80">{product.manufacturerCode}</span>
          </p>
        ) : null}
        {product.isRefurbished ? (
          <p>
            <span className="text-muted-foreground/70">Състояние:</span>{' '}
            <span className="font-normal text-emerald-700">
              Оригинална неизползвана част, демонтирана от нов уред.
            </span>
          </p>
        ) : null}
      </div>
      {description ? (
        <div className="border-y border-black/5 py-5 whitespace-pre-line text-sm leading-7 text-primary/65">
          {description}
        </div>
      ) : null}
      <div className="space-y-4 pt-5">
        <Suspense fallback={null}>
          <StockIndicator product={product} />
        </Suspense>

        <div className="flex items-center justify-between">
          <Suspense fallback={null}>
            <AddToCart product={product} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
