import type { PayloadHandler, PayloadRequest } from 'payload'

type MicroinvestEvent =
  | 'price.updated'
  | 'product.deactivated'
  | 'product.updated'
  | 'stock.updated'

type MicroinvestWebhookPayload = {
  data?: {
    description?: string
    manufacturerCode?: string
    originalSku?: string
    price?: number
    published?: boolean
    shortDescription?: string
    stockQty?: number
    title?: string
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

  if (typeof data?.title === 'string' && data.title.trim()) {
    nextData.title = data.title.trim()
  }

  if (typeof data?.description === 'string') {
    nextData.description = data.description
  }

  if (typeof data?.shortDescription === 'string') {
    nextData.shortDescription = data.shortDescription
  }

  if (typeof data?.originalSku === 'string') {
    nextData.originalSku = data.originalSku
  }

  if (typeof data?.manufacturerCode === 'string') {
    nextData.manufacturerCode = data.manufacturerCode
  }

  if (typeof data?.price === 'number' && Number.isFinite(data.price)) {
    nextData.price = data.price
  }

  if (typeof data?.stockQty === 'number' && Number.isFinite(data.stockQty)) {
    nextData.stockQty = data.stockQty
    nextData.stockStatus = normalizeStockStatus(data.stockQty)
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
