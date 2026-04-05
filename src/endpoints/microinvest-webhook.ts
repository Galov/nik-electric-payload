import type { PayloadHandler, PayloadRequest } from 'payload'
import { parseMicroinvestDescription } from '@/utilities/microinvest'

type MicroinvestEvent =
  | 'price.updated'
  | 'product.deactivated'
  | 'product.updated'
  | 'stock.updated'

type MicroinvestWebhookPayload = {
  data?: {
    catalog3?: string
    description?: string
    manufacturerCode?: string
    originalSku?: string
    priceGroup1?: number
    priceRetail?: number
    priceWholesale?: number
    published?: boolean
    state?: string
    stockQty?: number
  }
  event?: MicroinvestEvent
  sku?: string
  timestamp?: string
}

const SUPPORTED_EVENTS = new Set<MicroinvestEvent>([
  'price.updated',
  'product.deactivated',
  'product.updated',
  'stock.updated',
])

const json = (body: object, init?: ResponseInit) =>
  Response.json(body, {
    headers: {
      'cache-control': 'no-store',
    },
    ...init,
  })

const normalizeStockStatus = (stockQty?: number) => {
  if (typeof stockQty !== 'number') return undefined
  return stockQty > 0 ? 'instock' : 'outofstock'
}

const parsePayload = async (req: PayloadRequest): Promise<MicroinvestWebhookPayload | null> => {
  try {
    if (typeof req.json !== 'function') {
      return null
    }

    return (await req.json()) as MicroinvestWebhookPayload
  } catch {
    return null
  }
}

export const microinvestWebhook: PayloadHandler = async (req) => {
  const secret = process.env.MICROINVEST_WEBHOOK_SECRET
  const providedSecret = req.headers.get('x-microinvest-secret')

  if (!secret) {
    req.payload.logger.error('MICROINVEST_WEBHOOK_SECRET is not configured.')

    return json(
      {
        error: 'Webhook secret is not configured.',
      },
      { status: 500 },
    )
  }

  if (!providedSecret || providedSecret !== secret) {
    return json(
      {
        error: 'Unauthorized.',
      },
      { status: 401 },
    )
  }

  const payload = await parsePayload(req)

  if (!payload) {
    return json(
      {
        error: 'Invalid JSON body.',
      },
      { status: 400 },
    )
  }

  const { data, event, sku, timestamp } = payload

  if (!event || !SUPPORTED_EVENTS.has(event)) {
    return json(
      {
        error: 'Unsupported event.',
      },
      { status: 400 },
    )
  }

  if (!sku?.trim()) {
    return json(
      {
        error: 'Missing sku.',
      },
      { status: 400 },
    )
  }

  const matchingProducts = await req.payload.find({
    collection: 'products',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      sku: {
        equals: sku.trim(),
      },
    },
  })

  const product = matchingProducts.docs[0]

  if (!product) {
    req.payload.logger.warn(`Microinvest webhook received unknown SKU: ${sku}`)

    return json(
      {
        error: 'Product not found.',
        sku,
      },
      { status: 404 },
    )
  }

  const nextData: Record<string, unknown> = {}

  if (event === 'product.deactivated') {
    nextData.published = false
    nextData.stockQty = 0
    nextData.stockStatus = 'outofstock'
  }

  if (typeof data?.description === 'string') {
    const parsedDescription = parseMicroinvestDescription(data.description)

    if (parsedDescription) {
      nextData.originalSku = parsedDescription.originalSku
      nextData.productType = parsedDescription.productType
      nextData.isRefurbished = parsedDescription.isRefurbished
    }
  } else if (typeof data?.originalSku === 'string' && data.originalSku.trim()) {
    nextData.originalSku = data.originalSku.trim()
  }

  if (typeof data?.manufacturerCode === 'string') {
    nextData.manufacturerCode = data.manufacturerCode
  }

  if (typeof data?.catalog3 === 'string') {
    nextData.manufacturerCode = data.catalog3
  }

  if (typeof data?.priceRetail === 'number' && Number.isFinite(data.priceRetail)) {
    nextData.priceRetail = data.priceRetail
  }

  if (typeof data?.priceWholesale === 'number' && Number.isFinite(data.priceWholesale)) {
    nextData.priceWholesale = data.priceWholesale
  }

  if (typeof data?.priceGroup1 === 'number' && Number.isFinite(data.priceGroup1)) {
    nextData.priceGroup1 = data.priceGroup1
  }

  if (typeof data?.stockQty === 'number' && Number.isFinite(data.stockQty)) {
    nextData.stockQty = data.stockQty
    nextData.stockStatus = normalizeStockStatus(data.stockQty)
  }

  if (typeof data?.state === 'string') {
    if (data.state === 'Стоката не се използва') {
      nextData.published = false
    }

    if (data.state === 'Стоката се използва' || data.state === 'Стоката се използва често') {
      nextData.published = true
    }
  }

  if (typeof data?.published === 'boolean') {
    nextData.published = data.published
  }

  if (Object.keys(nextData).length === 0) {
    return json({
      event,
      message: 'No changes detected in payload.',
      productId: product.id,
      sku,
      timestamp,
    })
  }

  await req.payload.update({
    id: product.id,
    collection: 'products',
    data: nextData,
    depth: 0,
    overrideAccess: true,
  })

  req.payload.logger.info(`Microinvest webhook applied ${event} for SKU ${sku}`)

  return json({
    event,
    message: 'Webhook processed successfully.',
    productId: product.id,
    sku,
    timestamp,
    updatedFields: Object.keys(nextData),
  })
}
