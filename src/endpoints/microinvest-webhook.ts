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
    id?: number
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
  id?: number
  sku?: string
  timestamp?: string
}

type MicroinvestWebhookItemResult = {
  event?: MicroinvestEvent
  index: number
  message?: string
  miProductId?: number
  productId?: string
  sku?: string
  status: number
  timestamp?: string
  updatedFields?: string[]
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

const parsePayload = async (req: PayloadRequest): Promise<MicroinvestWebhookPayload[] | null> => {
  try {
    if (typeof req.json !== 'function') {
      return null
    }

    const body = (await req.json()) as unknown

    return Array.isArray(body) ? (body as MicroinvestWebhookPayload[]) : null
  } catch {
    return null
  }
}

const processWebhookItem = async ({
  item,
  index,
  req,
}: {
  item: MicroinvestWebhookPayload
  index: number
  req: PayloadRequest
}): Promise<MicroinvestWebhookItemResult> => {
  const { data, event, sku, timestamp } = item
  const normalizedSku = sku?.trim()
  const miProductId =
    typeof item.id === 'number' && Number.isFinite(item.id)
      ? item.id
      : typeof data?.id === 'number' && Number.isFinite(data.id)
        ? data.id
        : undefined

  if (!event || !SUPPORTED_EVENTS.has(event)) {
    return {
      event,
      index,
      message: 'Unsupported event.',
      miProductId,
      sku: normalizedSku,
      status: 400,
      timestamp,
    }
  }

  if (!normalizedSku && typeof miProductId !== 'number') {
    return {
      event,
      index,
      message: 'Missing product identifier.',
      miProductId,
      sku: normalizedSku,
      status: 400,
      timestamp,
    }
  }

  let product =
    typeof miProductId === 'number'
      ? (
          await req.payload.find({
            collection: 'products',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            pagination: false,
            where: {
              miProductId: {
                equals: miProductId,
              },
            },
          })
        ).docs[0]
      : undefined

  if (!product && normalizedSku) {
    product = (
      await req.payload.find({
        collection: 'products',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: {
          sku: {
            equals: normalizedSku,
          },
        },
      })
    ).docs[0]
  }

  if (!product) {
    req.payload.logger.warn(
      `Microinvest webhook received unknown product: miProductId=${miProductId ?? 'n/a'}, sku=${normalizedSku ?? 'n/a'}`,
    )

    return {
      event,
      index,
      message: 'Product not found.',
      miProductId,
      sku: normalizedSku,
      status: 404,
      timestamp,
    }
  }

  const nextData: Record<string, unknown> = {}

  if (typeof miProductId === 'number' && product.miProductId !== miProductId) {
    nextData.miProductId = miProductId
  }

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
    return {
      event,
      index,
      message: 'No changes detected in payload.',
      productId: product.id,
      miProductId,
      sku: normalizedSku,
      status: 200,
      timestamp,
    }
  }

  await req.payload.update({
    id: product.id,
    collection: 'products',
    data: nextData,
    depth: 0,
    overrideAccess: true,
  })

  req.payload.logger.info(
    `Microinvest webhook applied ${event} for product miProductId=${miProductId ?? 'n/a'}, sku=${normalizedSku ?? 'n/a'}`,
  )

  return {
    event,
    index,
    message: 'Webhook processed successfully.',
    productId: product.id,
    miProductId,
    sku: normalizedSku,
    status: 200,
    timestamp,
    updatedFields: Object.keys(nextData),
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
        error: 'Request body must be a JSON array.',
      },
      { status: 400 },
    )
  }

  if (payload.length === 0) {
    return json(
      {
        error: 'Request body must contain at least one item.',
      },
      { status: 400 },
    )
  }

  const results: MicroinvestWebhookItemResult[] = []

  for (const [index, item] of payload.entries()) {
    results.push(await processWebhookItem({ index, item, req }))
  }

  const hasErrors = results.some((result) => result.status >= 400)
  const hasSuccess = results.some((result) => result.status < 400)

  return json(
    {
      message: hasErrors ? 'Webhook processed with item-level errors.' : 'Webhook processed successfully.',
      processed: results.length,
      results,
    },
    { status: hasErrors && hasSuccess ? 207 : hasErrors ? 400 : 200 },
  )
}
