'use client'

import { Message } from '@/components/Message'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import React, { useCallback, FormEvent } from 'react'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { Address } from '@/payload-types'
import { getOrderAccessParams } from './getOrderAccessParams'

type Props = {
  customerEmail?: string
  billingAddress?: Partial<Address>
  shippingAddress?: Partial<Address>
  setProcessingPayment: React.Dispatch<React.SetStateAction<boolean>>
}

export const CheckoutForm: React.FC<Props> = ({
  customerEmail,
  billingAddress,
  shippingAddress,
  setProcessingPayment,
}) => {
  const [error, setError] = React.useState<null | string>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const router = useRouter()
  const { clearCart } = useCart()
  const { confirmOrder } = usePayments()

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setIsLoading(true)
      setProcessingPayment(true)

      try {
        const confirmResult = await confirmOrder('manual', {
          additionalData: {
            billingAddress,
            ...(customerEmail ? { customerEmail } : {}),
            shippingAddress,
          },
        })

        if (
          confirmResult &&
          typeof confirmResult === 'object' &&
          'orderID' in confirmResult &&
          confirmResult.orderID
        ) {
          let accessToken = 'accessToken' in confirmResult ? (confirmResult.accessToken as string) : ''
          const queryParams = new URLSearchParams()

          if (customerEmail) {
            queryParams.set('email', customerEmail)

            if (!accessToken) {
              const orderAccessParams = await getOrderAccessParams({
                email: customerEmail,
                orderID: String(confirmResult.orderID),
              })

              accessToken = orderAccessParams.accessToken
            }
          }
          if (accessToken) {
            queryParams.set('accessToken', accessToken)
          }

          clearCart()
          router.push(
            `/orders/${confirmResult.orderID}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
          )
          return
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Възникна неочакван проблем.'
        setError(`Грешка при изпращането на поръчката: ${msg}`)
      }

      setIsLoading(false)
      setProcessingPayment(false)
    },
    [
      billingAddress,
      clearCart,
      confirmOrder,
      customerEmail,
      router,
      setProcessingPayment,
      shippingAddress,
    ],
  )

  return (
    <form onSubmit={handleSubmit}>
      {error && <Message error={error} />}
      <div className="mt-8 flex gap-4">
        <Button
          className="h-12 rounded-md bg-[rgb(0,126,229)] px-9 text-sm font-normal text-white hover:bg-[rgb(0,113,206)]"
          disabled={isLoading}
          type="submit"
          variant="default"
        >
          {isLoading ? 'Изпраща се...' : 'Изпрати поръчката'}
        </Button>
      </div>
    </form>
  )
}
