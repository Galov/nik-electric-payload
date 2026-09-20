import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import { resolveLineTotalForTier, resolvePriceForTier, roundCurrency } from '@/utilities/pricing'
import { toMinorUnits } from '@/utilities/money'
import { completeOrder, saveOrderAndStock } from './completeOrder'

type ManualOrderData = {
  billingAddress?: Record<string, unknown>
  customerEmail?: string
  note?: string
  shippingAddress?: Record<string, unknown>
}

const getProductID = (value: unknown) => {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }

  return null
}

const getProductStockQty = (value: unknown) => {
  if (!value || typeof value !== 'object') return null

  const stockQty = (value as { stockQty?: unknown }).stockQty

  return typeof stockQty === 'number' && Number.isFinite(stockQty) ? stockQty : null
}

export const manualAdapter = (): PaymentAdapter => ({
  name: 'manual',
  label: 'Изпрати поръчката',
  group: {
    name: 'manual',
    type: 'group',
    admin: {
      condition: (data) => data?.paymentMethod === 'manual',
    },
    fields: [],
  },
  initiatePayment: async () => {
    return {
      message: 'Прегледът на поръчката започна.',
    }
  },
  confirmOrder: async ({ data, req: originalReq }) => {
    const result = await completeOrder(originalReq, async (req) => {
      const payload = req.payload
      const user = req.user
      const { billingAddress, customerEmail, note, shippingAddress } = (data ||
        {}) as ManualOrderData
      const cartsSlug = 'carts'

      let cartID = data?.cartID as string | undefined
      const cartSecret = data?.secret as string | undefined

      if (user?.cart?.docs?.length && !cartID) {
        const firstCart = user.cart.docs[0]
        cartID = typeof firstCart === 'object' ? String(firstCart.id) : String(firstCart)
      }

      if (!cartID) {
        throw new Error('Необходим е идентификатор на количката.')
      }

      if (cartSecret) {
        req.query = req.query || {}
        req.query.secret = cartSecret
      }

      const cart = await payload.findByID({
        id: cartID,
        collection: cartsSlug,
        depth: 2,
        overrideAccess: false,
        req,
        select: {
          currency: true,
          customer: true,
          items: true,
          subtotal: true,
        },
      })

      if (!cart?.items?.length) {
        throw new Error('Количката е празна.')
      }

      const resolvedEmail = user?.email || customerEmail
      const normalizedNote = typeof note === 'string' ? note.trim().slice(0, 1000) : ''

      if (!resolvedEmail) {
        throw new Error('За изпращане на поръчка е необходим имейл на клиента.')
      }

      const normalizedItems = cart.items.map((item) => {
        const product = item.product && typeof item.product === 'object' ? item.product : null
        const productUnitPrice = product
          ? resolvePriceForTier(
              (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
              product,
            )
          : undefined

        return {
          ...item,
          productMIId: typeof product?.miProductId === 'number' ? product.miProductId : undefined,
          productSKU: product?.sku || undefined,
          productUnitPrice,
        }
      })
      const orderedQuantitiesByProductID = new Map<
        string,
        {
          currentStockQty: null | number
          quantity: number
        }
      >()

      for (const item of cart.items) {
        const productID = getProductID(item.product)
        const quantity =
          typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0

        if (!productID || quantity <= 0) continue

        const current = orderedQuantitiesByProductID.get(productID)

        orderedQuantitiesByProductID.set(productID, {
          currentStockQty: current?.currentStockQty ?? getProductStockQty(item.product),
          quantity: (current?.quantity || 0) + quantity,
        })
      }

      const resolvedAmount = roundCurrency(
        cart.items.reduce((sum, item) => {
          return (
            sum +
            resolveLineTotalForTier(
              (user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier,
              item,
            )
          )
        }, 0),
      )
      const resolvedAmountMinor = toMinorUnits(resolvedAmount)

      return saveOrderAndStock(req, {
        transaction: {
          amount: resolvedAmountMinor,
          billingAddress,
          cart: cart.id,
          currency: cart.currency,
          customer: user?.id || undefined,
          customerEmail: resolvedEmail,
          items: normalizedItems,
          paymentMethod: 'manual',
          status: 'pending',
        },
        order: {
          amount: resolvedAmountMinor,
          currency: cart.currency,
          customer: user?.id || undefined,
          customerEmail: resolvedEmail,
          items: normalizedItems,
          note: normalizedNote || undefined,
          partnerCode: user?.partnerCode || undefined,
          shippingAddress,
          status: 'processing',
        },
        stock: orderedQuantitiesByProductID,
        cartID: cart.id,
      })
    })

    return {
      message: 'Поръчката беше изпратена успешно.',
      orderID: result.orderID,
      transactionID: result.transactionID,
    }
  },
})
