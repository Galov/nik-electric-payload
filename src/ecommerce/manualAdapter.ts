import type { PaymentAdapter, PaymentAdapterClient } from '@payloadcms/plugin-ecommerce/types'
import { resolveLineTotalForTier, resolvePriceForTier, roundCurrency } from '@/utilities/pricing'
import { toMinorUnits } from '@/utilities/money'

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
  confirmOrder: async ({ data, req }) => {
    const payload = req.payload
    const user = req.user
    const { billingAddress, customerEmail, note, shippingAddress } = (data || {}) as ManualOrderData
    const cartsSlug = 'carts'
    const ordersSlug = 'orders'
    const transactionsSlug = 'transactions'

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

    const transaction = await payload.create({
      collection: transactionsSlug,
      data: {
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
      overrideAccess: true,
      req,
    })

    const order = await payload.create({
      collection: ordersSlug,
      data: {
        amount: resolvedAmountMinor,
        currency: cart.currency,
        customer: user?.id || undefined,
        customerEmail: resolvedEmail,
        items: normalizedItems,
        note: normalizedNote || undefined,
        partnerCode:
          typeof (user as typeof user & { partnerCode?: string | null })?.partnerCode === 'string'
            ? (user as typeof user & { partnerCode?: string | null }).partnerCode
            : undefined,
        shippingAddress,
        status: 'processing',
        transactions: [transaction.id],
      },
      overrideAccess: true,
      req,
    })

    await payload.update({
      id: transaction.id,
      collection: transactionsSlug,
      data: {
        order: order.id,
        status: 'succeeded',
      },
      overrideAccess: true,
      req,
    })

    for (const [productID, ordered] of orderedQuantitiesByProductID.entries()) {
      if (ordered.currentStockQty === null) continue

      await payload.update({
        id: productID,
        collection: 'products',
        data: {
          stockQty: Math.max(0, ordered.currentStockQty - ordered.quantity),
        },
        overrideAccess: true,
        req,
      })
    }

    await payload.update({
      id: cart.id,
      collection: cartsSlug,
      data: {
        items: [],
        purchasedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })

    return {
      message: 'Поръчката беше изпратена успешно.',
      orderID: order.id,
      transactionID: transaction.id,
    }
  },
})

export const manualAdapterClient = (): PaymentAdapterClient => ({
  name: 'manual',
  label: 'Изпрати поръчката',
  confirmOrder: true,
  initiatePayment: false,
})
