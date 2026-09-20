import { claimDelivery, attemptWhere, type Recovery } from '@/ecommerce/deliveryState'
import { sendMicroinvestExportFailedEmail } from '@/utilities/email/notifications'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

type OrderItem = {
  productMIId?: number | null
  productUnitPrice?: number | null
  quantity?: number | null
}

type OrderLike = {
  customer?: string | { id?: string | null; partnerCode?: string | null } | null
  id?: number | string
  items?: OrderItem[] | null
  miOrderExportStatus?: 'failed' | 'pending' | 'sent' | string | null
  partnerCode?: string | null
  createdAt?: string | null
}

type MicroinvestOrderItem = {
  GoodID: number
  Note: string
  Price: number
  Qtty: number
}

type MicroinvestOrderPayload = {
  event: 'order.create'
  items: MicroinvestOrderItem[]
  PartnerCode: number | string
  timestamp: string
}

const getWebhookConfig = () => {
  const url = process.env.MICROINVEST_ORDERS_WEBHOOK_URL?.trim()
  const secret = process.env.MICROINVEST_ORDERS_WEBHOOK_SECRET?.trim()

  if (!url || !secret) {
    return null
  }

  return { secret, url }
}

const sanitizeNote = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(2)
}

const toValidISOString = (value?: string | null) => {
  if (!value?.trim()) {
    return null
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const normalizeItems = (value: unknown): OrderItem[] => {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is OrderItem => Boolean(item && typeof item === 'object'))
}

const resolvePartnerCode = async ({
  order,
  req,
}: {
  order: OrderLike
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}) => {
  const directPartnerCode = order.partnerCode?.trim()

  if (directPartnerCode) {
    return directPartnerCode
  }

  const customer = order.customer

  if (customer && typeof customer === 'object') {
    const objectPartnerCode = customer.partnerCode?.trim()

    if (objectPartnerCode) {
      return objectPartnerCode
    }

    if (typeof customer.id === 'string' && customer.id) {
      try {
        const user = await req.payload.findByID({
          collection: 'users',
          id: customer.id,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (typeof user?.partnerCode === 'string' && user.partnerCode.trim()) {
          return user.partnerCode.trim()
        }
      } catch {
        return null
      }
    }
  }

  if (typeof customer === 'string' && customer) {
    try {
      const user = await req.payload.findByID({
        collection: 'users',
        id: customer,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (typeof user?.partnerCode === 'string' && user.partnerCode.trim()) {
        return user.partnerCode.trim()
      }
    } catch {
      return null
    }
  }

  return null
}

const buildPayload = async ({
  order,
  req,
}: {
  order: OrderLike
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}) => {
  const orderID = String(order.id || '').trim()
  const partnerCode = await resolvePartnerCode({ order, req })
  const items = normalizeItems(order.items)

  if (!orderID) {
    throw new Error('Order ID is missing.')
  }

  if (!partnerCode) {
    throw new Error('Partner code is missing.')
  }

  if (!items.length) {
    throw new Error('Order has no items.')
  }

  const note = sanitizeNote(`online order ${orderID}`)
  const normalizedItems = items.map((item, index) => {
    if (typeof item.productMIId !== 'number' || !Number.isFinite(item.productMIId)) {
      throw new Error(`Item ${index + 1} is missing Microinvest product ID.`)
    }

    if (
      typeof item.quantity !== 'number' ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error(`Item ${index + 1} has invalid quantity.`)
    }

    if (
      typeof item.productUnitPrice !== 'number' ||
      !Number.isFinite(item.productUnitPrice) ||
      item.productUnitPrice < 0
    ) {
      throw new Error(`Item ${index + 1} is missing order unit price.`)
    }

    return {
      GoodID: item.productMIId,
      Note: note,
      Price: Number(formatNumber(item.productUnitPrice)),
      Qtty: item.quantity,
    } satisfies MicroinvestOrderItem
  })

  const normalizedPartnerCode = /^\d+$/.test(partnerCode) ? Number(partnerCode) : partnerCode
  const timestamp = toValidISOString(order.createdAt) || new Date().toISOString()

  return {
    payload: {
      event: 'order.create',
      items: normalizedItems,
      PartnerCode: normalizedPartnerCode,
      timestamp,
    } satisfies MicroinvestOrderPayload,
    partnerCode,
  }
}

// A durable atomic claim permits one sender only. Neither replay nor ordinary order
// updates retry exports. A lost acknowledgement must be reconciled with Microinvest.
export const exportOrderToMicroinvest = async (
  orderID: string,
  req: PayloadRequest,
  recovery?: Recovery,
) => {
  const claim = await claimDelivery(orderID, req, 'mi', recovery)
  if (!claim || claim.reconcile) return
  let status: 'failed' | 'sent' | 'unknown' = 'failed'
  let safeError = 'MICROINVEST_CONFIGURATION_OR_ORDER_INVALID'
  let started = false
  try {
    const config = getWebhookConfig()
    if (!config) throw new Error('Missing configuration')
    const { payload } = await buildPayload({ order: claim.order as OrderLike, req })
    started = true
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Nik-Secret': config.secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    status = response.ok ? 'sent' : 'unknown'
    safeError = response.ok ? '' : 'MICROINVEST_RESULT_UNCONFIRMED'
  } catch {
    if (started) {
      status = 'unknown'
      safeError = 'MICROINVEST_RESULT_UNCONFIRMED'
    }
  }
  const saved = await req.payload.db.updateOne({
    collection: 'orders',
    where: attemptWhere(orderID, 'mi', claim.attemptId),
    data: {
      miOrderExportStatus: status,
      miOrderExportLastError: safeError,
      miOrderExportFailurePhase: status === 'sent' ? null : started ? 'after-send' : 'before-send',
      miOrderExportFileName: `order.create:${orderID}`,
      miOrderExportNotificationStatus: status === 'sent' ? null : 'pending',
    },
  })
  if (!saved || status === 'sent') return
  // Only the winning attempt notifies. Ordinary edits never enter this sender.
  let notificationStatus = 'sent'
  try {
    await sendMicroinvestExportFailedEmail({
      order: saved as unknown as Parameters<typeof sendMicroinvestExportFailedEmail>[0]['order'],
      payload: req.payload,
    })
  } catch {
    notificationStatus = 'failed'
  }
  await req.payload.db.updateOne({
    collection: 'orders',
    where: {
      and: [{ id: { equals: orderID } }, { miOrderExportAttemptId: { equals: claim.attemptId } }],
    },
    data: {
      miOrderExportNotificationStatus: notificationStatus,
      miOrderExportNotificationError: notificationStatus === 'failed' ? 'ADMIN_EMAIL_FAILED' : '',
    },
  })
}
