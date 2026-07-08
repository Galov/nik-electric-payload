'use client'

import { Button } from '@/components/ui/button'
import type { Product } from '@/payload-types'
import { useAuth } from '@/providers/Auth'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import clsx from 'clsx'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { resolvePriceForTier } from '@/utilities/pricing'
import { getAvailableProductQuantity } from '@/utilities/product'
type Props = {
  product: Product
}

function clampQuantity(value: string | number, max: number): number {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return 1
  }

  return Math.min(Math.max(1, Math.trunc(parsedValue)), max)
}

export function AddToCart({ product }: Props) {
  const { user } = useAuth()
  const { addItem, cart, isLoading } = useCart()
  const [quantityInput, setQuantityInput] = useState('1')
  const [isQuantityOpen, setIsQuantityOpen] = useState(false)
  const normalizedProductID = String(product.id)
  const availableQty = getAvailableProductQuantity(product)
  const activePrice = resolvePriceForTier(
    (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
    {
      priceGroup1: (product as Product & { priceGroup1?: number | null }).priceGroup1,
      priceWholesale: (product as Product & { priceWholesale?: number | null }).priceWholesale,
    },
  )

  const existingQuantity = useMemo<number>(() => {
    const existingItem = cart?.items?.find((item) => {
      const productID = typeof item.product === 'object' ? item.product?.id : item.product

      return String(productID) === normalizedProductID
    })

    return existingItem?.quantity ?? 0
  }, [cart?.items, normalizedProductID])

  const remainingQty = Math.max(0, availableQty - existingQuantity)
  const maxSelectableQty = Math.max(1, remainingQty)
  const selectedQuantity = clampQuantity(quantityInput, maxSelectableQty)
  const quantityOptions = useMemo(
    () => Array.from({ length: maxSelectableQty }, (_, index) => index + 1),
    [maxSelectableQty],
  )

  useEffect(() => {
    setQuantityInput((currentQuantity) => String(clampQuantity(currentQuantity, maxSelectableQty)))
  }, [maxSelectableQty])

  const updateQuantity = useCallback((value: string) => {
    if (!/^\d*$/.test(value)) {
      return
    }

    setQuantityInput(value)
    setIsQuantityOpen(true)
  }, [])

  const openCart = useCallback(() => {
    window.dispatchEvent(new CustomEvent('nik-electric:open-cart'))
  }, [])

  const normalizeQuantityInput = useCallback(() => {
    setQuantityInput((currentQuantity) => String(clampQuantity(currentQuantity, maxSelectableQty)))
  }, [maxSelectableQty])

  const addToCart = useCallback(
    (e: React.FormEvent<HTMLButtonElement>) => {
      e.preventDefault()

      addItem(
        {
          product: normalizedProductID,
        },
        selectedQuantity,
      ).then(() => {
        toast.success(
          selectedQuantity > 1
            ? `Добавени са ${selectedQuantity} бр. в количката.`
            : 'Продуктът е добавен в количката.',
        )
        setQuantityInput('1')
      })
    },
    [addItem, normalizedProductID, selectedQuantity],
  )

  const disabled = useMemo<boolean>(() => {
    if (remainingQty <= 0 || activePrice <= 0 || !product.published) {
      return true
    }

    return false
  }, [activePrice, product.published, remainingQty])

  if (!user) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor={`quantity-${normalizedProductID}`}>
        Брой
      </label>
      <div
        className="relative w-24"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            normalizeQuantityInput()
            setIsQuantityOpen(false)
          }
        }}
      >
        <input
          aria-expanded={isQuantityOpen}
          aria-label="Брой"
          aria-controls={`quantity-options-${normalizedProductID}`}
          aria-haspopup="listbox"
          className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 pr-9 text-center font-sans text-sm text-slate-900 outline-none transition focus:border-[rgb(0,126,229)] focus:ring-2 focus:ring-[rgb(0,126,229)]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={disabled || isLoading}
          id={`quantity-${normalizedProductID}`}
          inputMode="numeric"
          onChange={(event) => updateQuantity(event.target.value)}
          onFocus={() => setIsQuantityOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsQuantityOpen(false)
            }

            if (event.key === 'Enter') {
              normalizeQuantityInput()
              setIsQuantityOpen(false)
            }
          }}
          pattern="[0-9]*"
          role="combobox"
          type="text"
          value={quantityInput}
        />
        <button
          aria-label="Покажи възможните количества"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={disabled || isLoading}
          onMouseDown={(event) => {
            event.preventDefault()
            setIsQuantityOpen((isOpen) => !isOpen)
          }}
          type="button"
        >
          ▾
        </button>
        {isQuantityOpen && !disabled && (
          <div
            className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            id={`quantity-options-${normalizedProductID}`}
            role="listbox"
          >
            {quantityOptions.map((quantityOption) => (
              <button
                aria-selected={quantityOption === selectedQuantity}
                className={clsx(
                  'block w-full px-3 py-2 text-center font-sans text-sm hover:bg-slate-100',
                  quantityOption === selectedQuantity
                    ? 'bg-slate-100 text-[rgb(0,126,229)]'
                    : 'text-slate-900',
                )}
                key={quantityOption}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuantityInput(String(quantityOption))
                  setIsQuantityOpen(false)
                }}
                role="option"
                type="button"
              >
                {quantityOption}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button
        aria-label="Добави в количката"
        variant={'outline'}
        className={clsx('font-sans', {
          'h-12 rounded-md border-[rgb(0,126,229)] bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)] hover:text-white':
            !disabled,
          'hover:opacity-90': true,
          'h-12 rounded-md px-9 text-sm font-normal': true,
        })}
        disabled={disabled || isLoading}
        onClick={addToCart}
        type="submit"
      >
        Добави в количката
      </Button>
      {existingQuantity > 0 ? (
        <Button
          className="h-12 w-full rounded-md border-[rgb(0,126,229)] px-9 text-sm font-normal text-[rgb(0,126,229)] hover:bg-[rgb(0,126,229)]/6 hover:text-[rgb(0,113,206)] sm:w-auto"
          onClick={openCart}
          type="button"
          variant="outline"
        >
          Към количката
        </Button>
      ) : null}
    </div>
  )
}
