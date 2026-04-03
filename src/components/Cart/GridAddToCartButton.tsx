'use client'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { useAuth } from '@/providers/Auth'
import clsx from 'clsx'
import { ShoppingCart } from 'lucide-react'
import React, { useMemo } from 'react'
import { toast } from 'sonner'
import { resolvePriceForTier } from '@/utilities/pricing'

type Props = {
  inventory?: null | number
  priceGroup1?: null | number
  priceWholesale?: null | number
  productID: number | string
  published?: boolean | null
  stockQty?: null | number
}

export const GridAddToCartButton: React.FC<Props> = ({
  inventory,
  priceGroup1,
  priceWholesale,
  productID,
  published,
  stockQty,
}) => {
  const { user } = useAuth()
  const { addItem, cart, isLoading } = useCart()
  const normalizedProductID = String(productID)

  const availableQty = typeof inventory === 'number' ? inventory : (stockQty ?? 0)
  const activePrice = resolvePriceForTier(
    (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
    {
      priceGroup1,
      priceWholesale,
    },
  )

  const disabled = useMemo(() => {
    const existingItem = cart?.items?.find((item) => {
      const itemProductID = typeof item.product === 'object' ? item.product?.id : item.product
      return String(itemProductID) === normalizedProductID
    })

    if (existingItem) {
      return existingItem.quantity >= availableQty
    }

    if (!published || activePrice <= 0) {
      return true
    }

    return availableQty <= 0
  }, [activePrice, availableQty, cart?.items, normalizedProductID, published])

  if (!user) {
    return null
  }

  const onClick = async () => {
    if (disabled || isLoading) return

    await addItem({
      product: normalizedProductID,
    })

    toast.success('Продуктът е добавен в количката.')
  }

  return (
    <button
      aria-label="Добави в количката"
      className={clsx(
        'inline-flex h-12 w-12 items-center justify-center transition duration-200 ease-out',
        {
          'cursor-not-allowed text-primary/25': disabled || isLoading,
          'cursor-pointer text-[rgb(0,126,229)] hover:scale-110 hover:text-[rgb(0,113,206)]':
            !disabled && !isLoading,
        },
      )}
      disabled={disabled || isLoading}
      onClick={onClick}
      type="button"
    >
      <ShoppingCart
        className={clsx('h-5 w-5 transition duration-200 ease-out', {
          'hover:-translate-y-1': !disabled && !isLoading,
        })}
      />
    </button>
  )
}
