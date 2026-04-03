import type {
  PaymentAdapter,
  PaymentAdapterClient,
} from '@payloadcms/plugin-ecommerce/types'
import { resolveLineTotalForTier } from '@/utilities/pricing'

type ManualOrderData = {
  billingAddress?: Record<string, unknown>
  customerEmail?: string
  shippingAddress?: Record<string, unknown>
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
  confirmOrder: async ({
    data,
    req,
  }) => {
    const payload = req.payload
    const user = req.user
    const { billingAddress, customerEmail, shippingAddress } = (data || {}) as ManualOrderData
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

    if (!resolvedEmail) {
      throw new Error('За изпращане на поръчка е необходим имейл на клиента.')
    }

    const normalizedItems = cart.items.map((item) => {
      const product =
        item.product && typeof item.product === 'object' ? item.product : null

      return {
        ...item,
        productSKU: product?.sku || undefined,
      }
    })

    const resolvedAmount = cart.items.reduce((sum, item) => {
      return sum + resolveLineTotalForTier((user as typeof user & { priceTier?: 'general' | 'group1' | null })?.priceTier, item)
    }, 0)

    const transaction = await payload.create({
      collection: transactionsSlug,
      data: {
        amount: resolvedAmount,
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
        amount: resolvedAmount,
        currency: cart.currency,
        customer: user?.id || undefined,
        customerEmail: resolvedEmail,
        items: normalizedItems,
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
