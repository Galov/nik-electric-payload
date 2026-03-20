'use client'

import { Button } from '@/components/ui/button'
import type { Product } from '@/payload-types'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import clsx from 'clsx'
import React, { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
type Props = {
  product: Product
}

export function AddToCart({ product }: Props) {
  const { addItem, cart, isLoading } = useCart()

  const addToCart = useCallback(
    (e: React.FormEvent<HTMLButtonElement>) => {
      e.preventDefault()

      addItem({
        product: product.id,
      }).then(() => {
        toast.success('Продуктът е добавен в количката.')
      })
    },
    [addItem, product],
  )

  const disabled = useMemo<boolean>(() => {
    const existingItem = cart?.items?.find((item) => {
      const productID = typeof item.product === 'object' ? item.product?.id : item.product

      if (productID === product.id) {
        return true
      }
    })

    if (existingItem) {
      const existingQuantity = existingItem.quantity

      return existingQuantity >= (product.inventory || 0)
    }

    if (product.inventory === 0 || product.price <= 0 || !product.published) {
      return true
    }

    return false
  }, [cart?.items, product])

  return (
    <Button
      aria-label="Добави в количката"
      variant={'outline'}
      className={clsx('font-sans', {
        'border-[rgb(0,126,229)] bg-[rgb(0,126,229)] text-white hover:bg-[rgb(0,113,206)] hover:text-white':
          !disabled,
        'hover:opacity-90': true,
      })}
      disabled={disabled || isLoading}
      onClick={addToCart}
      type="submit"
    >
      Добави в количката
    </Button>
  )
}
