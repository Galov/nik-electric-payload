'use client'

import { Price } from '@/components/Price'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import { ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

import { DeleteItemButton } from './DeleteItemButton'
import { EditItemQuantityButton } from './EditItemQuantityButton'
import { OpenCartButton } from './OpenCart'
import { Button } from '@/components/ui/button'
import { ProductTypeBadge } from '@/components/product/ProductTypeBadge'
import { Product } from '@/payload-types'
import { getProductPrimaryImage, getProductType } from '@/utilities/product'
import { useAuth } from '@/providers/Auth'
import { resolvePriceForTier, resolveSubtotalForTier } from '@/utilities/pricing'

export function CartModal() {
  const { user } = useAuth()
  const { cart } = useCart()
  const [isOpen, setIsOpen] = useState(false)

  const pathname = usePathname()

  useEffect(() => {
    // Close the cart modal when the pathname changes.
    setIsOpen(false)
  }, [pathname])

  const totalQuantity = useMemo(() => {
    if (!cart || !cart.items || !cart.items.length) return undefined
    return cart.items.reduce((quantity, item) => (item.quantity || 0) + quantity, 0)
  }, [cart])

  const activeSubtotal = useMemo(
    () =>
      resolveSubtotalForTier(
        (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
        cart?.items,
      ),
    [cart?.items, user],
  )

  return (
    <Sheet onOpenChange={setIsOpen} open={isOpen}>
      <SheetTrigger asChild>
        <OpenCartButton quantity={totalQuantity} />
      </SheetTrigger>

      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-xl font-normal text-primary/85">Моята количка</SheetTitle>

          <SheetDescription className="text-primary/55">
            Прегледай продуктите и общата сума на поръчката.
          </SheetDescription>
        </SheetHeader>

        {!cart || cart?.items?.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-8 text-center">
            <ShoppingCart className="h-16 text-primary/35" />
            <p className="text-center text-2xl font-medium text-primary/75">Количката е празна.</p>
          </div>
        ) : (
          <div className="flex grow px-2">
            <div className="flex w-full flex-col justify-between">
              <ul className="grow overflow-auto py-4">
                {cart?.items?.map((item, i) => {
                  const product = item.product

                  if (typeof product !== 'object' || !item || !product || !product.slug)
                    return <React.Fragment key={i} />

                  const image = getProductPrimaryImage(product)
                  const productType = getProductType(product)
                  const price = resolvePriceForTier(
                    (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
                    {
                      priceGroup1: (product as Product & { priceGroup1?: number | null }).priceGroup1,
                      priceWholesale: (product as Product & { priceWholesale?: number | null }).priceWholesale,
                    },
                  )

                  return (
                    <li className="flex w-full flex-col border-b border-black/5 py-4 last:border-b-0" key={i}>
                      <div className="relative flex w-full flex-col gap-3 sm:flex-row sm:justify-between">
                        <div className="absolute left-14 top-0 z-40 sm:left-12">
                          <DeleteItemButton item={item} />
                        </div>
                        <Link
                          className="z-30 flex flex-1 flex-row gap-3 pr-8 sm:pr-0"
                          href={`/product/${(item.product as Product)?.slug}`}
                        >
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-black/8 bg-white sm:h-16 sm:w-16">
                            {image?.url ? (
                              <Image
                                alt={image.alt}
                                className="h-full w-full rounded-md object-contain"
                                fill
                                sizes="(min-width: 640px) 64px, 80px"
                                src={image.url}
                              />
                            ) : null}
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col text-base">
                            <span className="text-sm leading-5 text-primary/80 sm:text-sm">{product?.title}</span>
                            {productType ? (
                              <ProductTypeBadge compact className="mt-1 self-start" value={productType} />
                            ) : null}
                          </div>
                        </Link>
                        <div className="flex flex-row items-end justify-between gap-3 sm:h-16 sm:min-w-[88px] sm:flex-col sm:justify-between">
                          {typeof price === 'number' && (
                            <Price
                              amount={price}
                              className="flex justify-end text-right text-sm text-primary/70"
                              currencyCode="EUR"
                            />
                          )}
                          <div className="ml-auto flex h-8 flex-row items-center rounded-md border border-black/10 bg-white">
                            <EditItemQuantityButton item={item} type="minus" />
                            <p className="w-6 text-center">
                              <span className="w-full text-sm text-primary/70">{item.quantity}</span>
                            </p>
                            <EditItemQuantityButton item={item} type="plus" />
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="border-t border-black/5 px-2 pb-4 pt-5">
                <div className="text-sm text-primary/55">
                  {typeof activeSubtotal === 'number' && (
                    <div className="mb-4 flex items-center justify-between">
                      <p>Общо</p>
                      <Price
                        amount={activeSubtotal}
                        className="text-right text-base text-primary/80"
                        currencyCode="EUR"
                      />
                    </div>
                  )}

                  <Button
                    asChild
                    className="h-12 w-full rounded-md bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
                  >
                    <Link className="w-full" href="/checkout">
                      Към поръчката
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
