'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Price } from '@/components/Price'
import { EditItemQuantityButton } from '@/components/Cart/EditItemQuantityButton'
import { AddressItem } from '@/components/addresses/AddressItem'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import { CheckoutAddresses } from '@/components/checkout/CheckoutAddresses'
import { CheckoutForm } from '@/components/forms/CheckoutForm'
import { FormItem } from '@/components/forms/FormItem'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/Auth'
import { getProductPrimaryImage } from '@/utilities/product'
import { resolvePriceForTier, resolveSubtotalForTier } from '@/utilities/pricing'
import { useAddresses, useCart } from '@payloadcms/plugin-ecommerce/client/react'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import type { Address } from '@/payload-types'

export const CheckoutPage: React.FC = () => {
  const { user } = useAuth()
  const { cart } = useCart()
  const { addresses } = useAddresses()
  const [email, setEmail] = useState('')
  const [emailEditable, setEmailEditable] = useState(true)
  const [shippingAddress, setShippingAddress] = useState<Partial<Address>>()
  const [billingAddress, setBillingAddress] = useState<Partial<Address>>()
  const [billingAddressSameAsShipping, setBillingAddressSameAsShipping] = useState(true)
  const [isProcessingPayment, setProcessingPayment] = useState(false)
  const activeSubtotal = resolveSubtotalForTier(
    (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
    cart?.items,
  )

  const cartIsEmpty = !cart || !cart.items || !cart.items.length

  useEffect(() => {
    if (!shippingAddress && addresses && addresses.length > 0) {
      const defaultAddress = addresses[0]

      if (defaultAddress) {
        setBillingAddress(defaultAddress)
      }
    }
  }, [addresses, shippingAddress])

  useEffect(() => {
    return () => {
      setShippingAddress(undefined)
      setBillingAddress(undefined)
      setBillingAddressSameAsShipping(true)
      setEmail('')
      setEmailEditable(true)
    }
  }, [])

  if (cartIsEmpty && isProcessingPayment) {
    return (
      <div className="w-full items-center justify-center py-12">
        <div className="prose mb-8 max-w-none self-center text-center dark:prose-invert">
          <p>Поръчката се изпраща...</p>
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  if (cartIsEmpty) {
    return (
      <div className="w-full py-12 text-primary/70">
        <p className="mb-3 text-lg">Количката е празна.</p>
        <Link className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]" href="/shop">
          Продължи с пазаруването
        </Link>
      </div>
    )
  }

  const canSubmitOrder = Boolean(
    (email || user) && billingAddress && (billingAddressSameAsShipping || shippingAddress),
  )

  return (
    <div className="my-8 flex grow flex-col items-stretch justify-stretch gap-10 md:flex-row md:gap-6 lg:gap-8">
      <div className="flex basis-full flex-col justify-stretch gap-8 lg:basis-2/3">
        <h2 className="text-2xl font-normal text-primary/85">Контакт</h2>

        {!user && (
          <div className="flex w-full items-center bg-muted/20 px-5 py-4">
            <div className="text-sm leading-7 text-primary/65">
              <Button asChild className="text-inherit no-underline" variant="outline">
                <Link href="/login?redirect=/checkout">Вход</Link>
              </Button>
              <p className="mt-0">
                <span className="mx-2">или</span>
                <Link href="/create-account?redirect=/checkout">създай профил</Link>
              </p>
            </div>
          </div>
        )}

        {user ? (
          <div className="bg-muted/20 px-5 py-4">
            <p className="text-sm text-primary/75">{user.email}</p>
            <p className="text-sm text-primary/65">
              Не сте вие?{' '}
              <Link className="text-[rgb(0,126,229)] hover:text-[rgb(0,113,206)]" href="/logout">
                Изход
              </Link>
            </p>
          </div>
        ) : (
          <div className="bg-muted/20 px-5 py-4">
            <p className="mb-4 text-primary/65">Въведи имейл, за да продължиш като гост.</p>

            <FormItem className="mb-6">
              <Label htmlFor="email">Имейл адрес</Label>
              <Input
                disabled={!emailEditable}
                id="email"
                name="email"
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
              />
            </FormItem>

            <Button
              className="rounded-md bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
              disabled={!email || !emailEditable}
              onClick={(e) => {
                e.preventDefault()
                setEmailEditable(false)
              }}
              variant="default"
            >
              Продължи като гост
            </Button>
          </div>
        )}

        <h2 className="text-2xl font-normal text-primary/85">Адрес</h2>

        {billingAddress ? (
          <AddressItem
            actions={
              <Button
                onClick={(e) => {
                  e.preventDefault()
                  setBillingAddress(undefined)
                }}
                variant="outline"
              >
                Премахни
              </Button>
            }
            address={billingAddress}
          />
        ) : user ? (
          <CheckoutAddresses heading="Адрес за фактуриране" setAddress={setBillingAddress} />
        ) : (
          <CreateAddressModal
            callback={(address) => {
              setBillingAddress(address)
            }}
            disabled={!email || emailEditable}
            skipSubmission={true}
          />
        )}

        <div className="flex items-center gap-4">
          <Checkbox
            checked={billingAddressSameAsShipping}
            disabled={Boolean(!user && (!email || emailEditable))}
            id="shippingTheSameAsBilling"
            onCheckedChange={(state) => {
              setBillingAddressSameAsShipping(state as boolean)
            }}
          />
          <Label
            className="font-sans font-normal tracking-normal text-primary/65"
            htmlFor="shippingTheSameAsBilling"
          >
            Адресът за доставка е същият
          </Label>
        </div>

        {!billingAddressSameAsShipping &&
          (shippingAddress ? (
            <AddressItem
              actions={
                <Button
                  onClick={(e) => {
                    e.preventDefault()
                    setShippingAddress(undefined)
                  }}
                  variant="outline"
                >
                  Премахни
                </Button>
              }
              address={shippingAddress}
            />
          ) : user ? (
            <CheckoutAddresses
              description="Моля, изберете адрес за доставка."
              heading="Адрес за доставка"
              setAddress={setShippingAddress}
            />
          ) : (
            <CreateAddressModal
              callback={(address) => {
                setShippingAddress(address)
              }}
              disabled={!email || emailEditable}
              skipSubmission={true}
            />
          ))}

        <div className="bg-muted/20 px-5 py-4 text-sm text-primary/60">
          Не се събира онлайн плащане. Изпращането на формата създава заявка за поръчка за
          ръчна обработка.
        </div>

        {canSubmitOrder && (
          <CheckoutForm
            billingAddress={billingAddress}
            customerEmail={email}
            setProcessingPayment={setProcessingPayment}
            shippingAddress={billingAddressSameAsShipping ? billingAddress : shippingAddress}
          />
        )}
      </div>

      <div className="flex basis-full flex-col gap-6 bg-muted/20 px-5 pb-6 pt-1 md:px-7 md:pb-8 md:pt-1 lg:basis-1/3">
        <h2 className="text-2xl font-normal text-primary/85">Твоята количка</h2>

        {cart?.items?.map((item, index) => {
          if (typeof item.product !== 'object' || !item.quantity) {
            return null
          }

          const image = getProductPrimaryImage(item.product)

          return (
            <div className="flex items-start gap-3 border-b border-black/5 pb-4 last:border-b-0 last:pb-0" key={index}>
              <div className="flex h-16 w-16 shrink-0 items-stretch justify-stretch rounded-md border border-black/8 bg-white p-2">
                <div className="relative h-full w-full">
                  {image?.url ? (
                    <Image
                      alt={image.alt}
                      className="rounded-md object-contain"
                      fill
                      sizes="64px"
                      src={image.url}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex grow flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium leading-5 text-primary/85">{item.product.title}</p>
                  <div className="flex h-8 w-fit flex-row items-center rounded-md border border-black/10 bg-white">
                    <EditItemQuantityButton item={item} type="minus" />
                    <p className="w-8 text-center text-sm text-primary/70">{item.quantity}</p>
                    <EditItemQuantityButton item={item} type="plus" />
                  </div>
                </div>

                {(typeof (item.product as typeof item.product & { priceWholesale?: number | null }).priceWholesale === 'number' ||
                  typeof (item.product as typeof item.product & { priceGroup1?: number | null }).priceGroup1 === 'number') && (
                  <Price
                    amount={resolvePriceForTier(
                      (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
                      {
                        priceGroup1: (item.product as typeof item.product & { priceGroup1?: number | null })
                          .priceGroup1,
                        priceWholesale: (item.product as typeof item.product & { priceWholesale?: number | null })
                          .priceWholesale,
                      },
                    )}
                    className="text-sm text-primary/75 sm:text-right"
                    currencyCode="EUR"
                  />
                )}
              </div>
            </div>
          )
        })}

        <div className="border-t border-black/5 pt-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-primary/45">Общо</span>
            <Price amount={activeSubtotal} className="text-2xl font-medium text-primary/80" currencyCode="EUR" />
          </div>
        </div>
      </div>
    </div>
  )
}
