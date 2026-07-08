'use client'

import { Price } from '@/components/Price'
import { ProductTypeBadge } from '@/components/product/ProductTypeBadge'
import { useAuth } from '@/providers/Auth'
import { Product } from '@/payload-types'
import { getProductPrimaryImage, getProductType } from '@/utilities/product'
import { resolvePriceForTier } from '@/utilities/pricing'
import Image from 'next/image'
import Link from 'next/link'

type Props = {
  product: Product
  style?: 'compact' | 'default'
  quantity?: number
  /**
   * Force all formatting to a particular currency.
   */
  currencyCode?: string
}

export const ProductItem: React.FC<Props> = ({ product, quantity, currencyCode }) => {
  const { user } = useAuth()
  const { title } = product
  const image = getProductPrimaryImage(product)
  const itemPrice = resolvePriceForTier(
    (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
    {
      priceGroup1: (product as Product & { priceGroup1?: number | null }).priceGroup1,
      priceWholesale: (product as Product & { priceWholesale?: number | null }).priceWholesale,
    },
  )
  const itemURL = `/product/${product.slug}`
  const productType = getProductType(product)

  return (
    <div className="flex min-w-0 items-start gap-4">
      <div className="flex h-20 w-20 shrink-0 items-stretch justify-stretch border border-black/8 bg-white p-2">
        <div className="relative h-full w-full">
          {image?.url && (
            <Image alt={image.alt} className="object-contain" fill sizes="80px" src={image.url} />
          )}
        </div>
      </div>
      <div className="flex min-w-0 grow flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="break-words text-lg font-medium leading-6 text-primary/85">
            <Link href={itemURL}>{title}</Link>
          </p>
          {productType ? (
            <ProductTypeBadge compact className="self-start" value={productType} />
          ) : null}
          <div className="text-sm text-primary/55">
            {'x'}
            {quantity}
          </div>
        </div>

        {itemPrice && quantity && (
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-base font-medium text-primary/75">Междинна сума</p>
            <Price
              className="text-sm text-primary/55"
              amount={itemPrice * quantity}
              currencyCode={currencyCode || 'EUR'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
