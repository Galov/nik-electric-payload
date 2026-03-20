'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Price } from '@/components/Price'
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
      <div className="prose w-full items-center py-12 dark:prose-invert">
        <p>Количката е празна.</p>
        <Link href="/shop">Продължи с пазаруването</Link>
      </div>
    )
  }

  const canSubmitOrder = Boolean(
    (email || user) && billingAddress && (billingAddressSameAsShipping || shippingAddress),
  )

  return (
    <div className="my-8 flex grow flex-col items-stretch justify-stretch gap-10 md:flex-row md:gap-6 lg:gap-8">
      <div className="flex basis-full flex-col justify-stretch gap-8 lg:basis-2/3">
        <h2 className="text-3xl font-medium">Контакт</h2>

        {!user && (
          <div className="flex w-full items-center rounded-lg bg-accent p-4 dark:bg-black">
            <div className="prose dark:prose-invert">
              <Button asChild className="text-inherit no-underline" variant="outline">
                <Link href="/login">Вход</Link>
              </Button>
              <p className="mt-0">
                <span className="mx-2">или</span>
                <Link href="/create-account">създай профил</Link>
              </p>
            </div>
          </div>
        )}

        {user ? (
          <div className="rounded-lg bg-accent p-4 dark:bg-card">
            <p>{user.email}</p>
            <p>
              Не сте вие?{' '}
              <Link className="underline" href="/logout">
                Изход
              </Link>
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-accent p-4 dark:bg-black">
            <p className="mb-4">Въведи имейл, за да продължиш като гост.</p>

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

        <h2 className="text-3xl font-medium">Адрес</h2>

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
          <Label htmlFor="shippingTheSameAsBilling">Адресът за доставка е същият</Label>
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

        <div className="rounded-lg bg-primary/5 p-4 text-sm text-muted-foreground">
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

      <div className="flex basis-full flex-col gap-8 rounded-lg bg-primary/5 p-8 lg:basis-1/3 lg:pl-8">
        <h2 className="text-3xl font-medium">Твоята количка</h2>

        {cart?.items?.map((item, index) => {
          if (typeof item.product !== 'object' || !item.quantity) {
            return null
          }

          const image = getProductPrimaryImage(item.product)

          return (
            <div className="flex items-start gap-4" key={index}>
              <div className="flex h-20 w-20 items-stretch justify-stretch rounded-lg border p-2">
                <div className="relative h-full w-full">
                  {image?.url ? (
                    <Image
                      alt={image.alt}
                      className="rounded-lg object-cover"
                      fill
                      sizes="80px"
                      src={image.url}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex grow items-center justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-medium">{item.product.title}</p>
                  <div>x{item.quantity}</div>
                </div>

                {typeof item.product.price === 'number' && <Price amount={item.product.price} />}
              </div>
            </div>
          )
        })}

        <hr />

        <div className="flex items-center justify-between gap-2">
          <span className="uppercase">Общо</span>
          <Price amount={cart?.subtotal || 0} className="text-3xl font-medium" />
        </div>
      </div>
    </div>
  )
}
