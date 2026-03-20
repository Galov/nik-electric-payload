'use client'
import type { Product } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import React, { Suspense } from 'react'
import { StockIndicator } from '@/components/product/StockIndicator'
import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'

export function ProductDescription({ product }: { product: Product }) {
  const description = formatLegacyProductDescription(product.description)
  const categories = (product.categories || [])
    .map((category) => {
      if (!category || typeof category === 'string') return null
      return category.title
    })
    .filter(Boolean)
    .join(', ')
  const brand = product.brand && typeof product.brand !== 'string' ? product.brand.title : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-xl font-normal leading-tight text-primary/80 lg:text-2xl">
          {product.title}
        </h1>
        <div className="text-base font-normal text-primary/60 lg:text-lg">
          <Price amount={product.price} />
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border bg-muted/20 p-4 text-sm">
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
        {categories ? (
          <p>
            <span className="text-muted-foreground/70">Категория:</span>{' '}
            <span className="font-normal text-primary/80">{categories}</span>
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
      </div>
      {description ? (
        <div className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
          {description}
        </div>
      ) : null}
      <hr />
      <div className="flex items-center justify-between">
        <Suspense fallback={null}>
          <StockIndicator product={product} />
        </Suspense>
      </div>

      <div className="flex items-center justify-between">
        <Suspense fallback={null}>
          <AddToCart product={product} />
        </Suspense>
      </div>
    </div>
  )
}
