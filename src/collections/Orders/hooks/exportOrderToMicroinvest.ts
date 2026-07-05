import type { CollectionAfterChangeHook } from 'payload'

import { sendMicroinvestExportFailedEmail } from '@/utilities/email/notifications'

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

    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) {
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

const sendOrderWebhook = async ({ payload }: { payload: MicroinvestOrderPayload }) => {
  const config = getWebhookConfig()

  if (!config) {
    throw new Error('Microinvest webhook config is missing.')
  }

  const response = await fetch(config.url, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Nik-Secret': config.secret,
    },
    method: 'POST',
  })

  if (response.ok) {
    return
  }

  const responseText = await response.text().catch(() => '')
  throw new Error(
    `Microinvest webhook failed with status ${response.status}${responseText ? `: ${responseText}` : '.'}`,
  )
}

export const exportOrderToMicroinvestHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (req.context?.skipMicroinvestOrderExport) {
    return doc
  }

  if (operation !== 'create' && operation !== 'update') {
    return doc
  }

  if (operation === 'update' && (doc as OrderLike).miOrderExportStatus === 'sent') {
    return doc
  }

  const exportReference = `order.create:${String(doc.id)}`

  try {
    const { partnerCode, payload } = await buildPayload({
      order: doc as OrderLike,
      req,
    })

    await sendOrderWebhook({ payload })

    await req.payload.update({
      id: doc.id,
      collection: 'orders',
      context: {
        ...req.context,
        skipMicroinvestOrderExport: true,
      },
      data: {
        miOrderExportFileName: exportReference,
        miOrderExportLastAttemptAt: new Date().toISOString(),
        miOrderExportLastError: '',
        miOrderExportStatus: 'sent',
        partnerCode,
      },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export error.'

    req.payload.logger.error({
      err: error,
      msg: `Microinvest order export failed for order ${String(doc.id)}`,
    })

    await req.payload.update({
      id: doc.id,
      collection: 'orders',
      context: {
        ...req.context,
        skipMicroinvestOrderExport: true,
      },
      data: {
        miOrderExportFileName: exportReference,
        miOrderExportLastAttemptAt: new Date().toISOString(),
        miOrderExportLastError: message,
        miOrderExportStatus: 'failed',
      },
      overrideAccess: true,
      req,
    })

    try {
      await sendMicroinvestExportFailedEmail({
        order: {
          ...(doc as OrderLike),
          miOrderExportLastError: message,
        },
        payload: req.payload,
      })
    } catch (emailError) {
      req.payload.logger.error({
        err: emailError,
        msg: `Failed to send Microinvest export failed email for order ${String(doc.id)}`,
      })
    }
  }

  return doc
}
