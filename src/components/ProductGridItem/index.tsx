import type { Product } from '@/payload-types'

import { GridAddToCartButton } from '@/components/Cart/GridAddToCartButton'
import { Price } from '@/components/Price'
import { ManufacturerBadge } from '@/components/product/ManufacturerBadge'
import { ProductTypeBadge } from '@/components/product/ProductTypeBadge'
import { getProductPrimaryImage, getProductType } from '@/utilities/product'
import Link from 'next/link'
import React from 'react'
import clsx from 'clsx'
import Image from 'next/image'

type Props = {
  product: Partial<Product>
}

const hasCategoryTitle = (
  category: Product['categories'] extends infer T ? T extends Array<infer U> ? U : never : never,
): category is Extract<NonNullable<Product['categories']>[number], { title: string }> =>
  Boolean(category && typeof category !== 'string' && 'title' in category && category.title)

export const ProductGridItem: React.FC<Props> = ({ product }) => {
  const { title } = product
  const image = getProductPrimaryImage(product)
  const manufacturerCode = product.manufacturerCode || null
  const productType = getProductType(product)
  const primaryCategory = product.categories?.find(hasCategoryTitle)?.title || null

  return (
    <article className="group flex h-full flex-col rounded-[10px] border border-transparent bg-white p-4 transition duration-300 ease-out hover:border-black/5 hover:shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
      <div className="flex min-h-7 flex-wrap gap-2">
        {manufacturerCode ? <ManufacturerBadge value={manufacturerCode} /> : null}
        {productType ? <ProductTypeBadge value={productType} /> : null}
      </div>

      <Link className="flex flex-1 flex-col" href={`/product/${product.slug}`}>
        <div className="relative mb-4 aspect-square overflow-hidden bg-white p-6">
          {image?.url ? (
            <Image
              alt={image.alt}
              className={clsx('object-contain transition duration-300 ease-in-out group-hover:scale-[1.02]')}
              fill
              sizes="(min-width: 1280px) 18rem, (min-width: 1024px) 16rem, (min-width: 640px) 14rem, 100vw"
              src={image.url}
            />
          ) : (
            <div className="h-full w-full bg-muted/40" />
          )}
        </div>

        <div className="flex flex-1 flex-col">
          <div className="min-h-[2.5rem] font-medium leading-[1.2] tracking-[-0.01em] text-[rgb(0,126,229)]">
            {title}
          </div>

          <div className="mt-1 min-h-[3.75rem] space-y-0 text-sm leading-5 text-primary/35">
            {primaryCategory ? <p>{primaryCategory}</p> : null}
            {product.sku ? <p className="text-primary/55">Код: {product.sku}</p> : null}
          </div>
        </div>
      </Link>

      <div className="mt-2 flex items-center justify-between gap-4">
        {(typeof (product as Partial<Product> & { priceWholesale?: number | null }).priceWholesale === 'number' ||
          typeof (product as Partial<Product> & { priceGroup1?: number | null }).priceGroup1 === 'number') && (
          <div className="font-semibold leading-none text-primary/75">
            <Price
              amount={0}
              priceGroup1={(product as Partial<Product> & { priceGroup1?: number | null }).priceGroup1}
              priceWholesale={(product as Partial<Product> & { priceWholesale?: number | null }).priceWholesale}
            />
          </div>
        )}

        {product.id ? (
          <GridAddToCartButton
            inventory={product.inventory}
            priceGroup1={(product as Partial<Product> & { priceGroup1?: number | null }).priceGroup1}
            priceWholesale={(product as Partial<Product> & { priceWholesale?: number | null }).priceWholesale}
            productID={product.id}
            published={product.published}
            stockQty={product.stockQty}
          />
        ) : null}
      </div>
    </article>
  )
}
