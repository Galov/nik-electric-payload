import type { PayloadHandler, PayloadRequest } from 'payload'
import { parseMicroinvestDescription } from '@/utilities/microinvest'

type MicroinvestEvent = 'product.created' | 'product.updated' | 'product.deleted'

type MicroinvestWebhookItem = {
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
    title?: string
  }
  id?: number
  sku?: string
  timestamp?: string
}

type MicroinvestWebhookBody = {
  event?: MicroinvestEvent
  items?: MicroinvestWebhookItem[]
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
  'product.created',
  'product.updated',
  'product.deleted',
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

const parsePayload = async (
  req: PayloadRequest,
): Promise<{ event: MicroinvestEvent; items: MicroinvestWebhookItem[] } | null> => {
  try {
    if (typeof req.json !== 'function') {
      return null
    }

    const body = (await req.json()) as MicroinvestWebhookBody

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null
    }

    if (!body.event || !SUPPORTED_EVENTS.has(body.event)) {
      return null
    }

    if (!Array.isArray(body.items)) {
      return null
    }

    return {
      event: body.event,
      items: body.items,
    }
  } catch {
    return null
  }
}

const findProduct = async ({
  miProductId,
  req,
  sku,
}: {
  miProductId?: number
  req: PayloadRequest
  sku?: string
}) => {
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

  if (!product && sku) {
    product = (
      await req.payload.find({
        collection: 'products',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: {
          sku: {
            equals: sku,
          },
        },
      })
    ).docs[0]
  }

  return product
}

const buildUpdateData = ({
  data,
  miProductId,
  product,
}: {
  data?: MicroinvestWebhookItem['data']
  miProductId?: number
  product?: Record<string, unknown>
}) => {
  const nextData: Record<string, unknown> = {}

  if (
    typeof miProductId === 'number' &&
    (!product || typeof product.miProductId !== 'number' || product.miProductId !== miProductId)
  ) {
    nextData.miProductId = miProductId
  }

  if (typeof data?.description === 'string') {
    const parsedDescription = parseMicroinvestDescription(data.description)

    if (parsedDescription) {
      nextData.originalSku = parsedDescription.originalSku
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

  if (typeof data?.title === 'string' && data.title.trim()) {
    nextData.title = data.title.trim()
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

  return nextData
}

const processWebhookItem = async ({
  event,
  item,
  index,
  req,
}: {
  event: MicroinvestEvent
  item: MicroinvestWebhookItem
  index: number
  req: PayloadRequest
}): Promise<MicroinvestWebhookItemResult> => {
  const { data, sku, timestamp } = item
  const normalizedSku = sku?.trim()
  const miProductId =
    typeof item.id === 'number' && Number.isFinite(item.id)
      ? item.id
      : typeof data?.id === 'number' && Number.isFinite(data.id)
        ? data.id
        : undefined

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

  const product = await findProduct({
    miProductId,
    req,
    sku: normalizedSku,
  })

  if (event === 'product.created') {
    if (product) {
      return {
        event,
        index,
        message: 'Product already exists.',
        miProductId,
        productId: product.id,
        sku: normalizedSku,
        status: 409,
        timestamp,
      }
    }

    const title =
      (typeof data?.title === 'string' && data.title.trim()) ||
      (normalizedSku ? normalizedSku : null)

    if (!normalizedSku || !title) {
      return {
        event,
        index,
        message: 'Missing required fields for product creation.',
        miProductId,
        sku: normalizedSku,
        status: 400,
        timestamp,
      }
    }

    const nextData = buildUpdateData({
      data,
      miProductId,
    })

    if (!('priceRetail' in nextData)) nextData.priceRetail = 0
    if (!('priceWholesale' in nextData)) nextData.priceWholesale = 0
    if (!('priceGroup1' in nextData)) nextData.priceGroup1 = 0
    if (!('stockQty' in nextData)) nextData.stockQty = 0
    if (!('stockStatus' in nextData)) nextData.stockStatus = 'outofstock'
    if (!('published' in nextData)) nextData.published = true

    nextData.sku = normalizedSku
    nextData.title = title

    const createdProduct = await req.payload.create({
      collection: 'products',
      data: nextData as any,
      depth: 0,
      draft: false,
      overrideAccess: true,
    })

    req.payload.logger.info(
      `Microinvest webhook created product miProductId=${miProductId ?? 'n/a'}, sku=${normalizedSku ?? 'n/a'}`,
    )

    return {
      event,
      index,
      message: 'Product created successfully.',
      productId: createdProduct.id,
      miProductId,
      sku: normalizedSku,
      status: 201,
      timestamp,
      updatedFields: Object.keys(nextData),
    }
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

  if (event === 'product.deleted') {
    await req.payload.delete({
      id: product.id,
      collection: 'products',
      depth: 0,
      overrideAccess: true,
    })

    req.payload.logger.info(
      `Microinvest webhook deleted product miProductId=${miProductId ?? 'n/a'}, sku=${normalizedSku ?? 'n/a'}`,
    )

    return {
      event,
      index,
      message: 'Product deleted successfully.',
      productId: product.id,
      miProductId,
      sku: normalizedSku,
      status: 200,
      timestamp,
    }
  }

  const nextData = buildUpdateData({
    data,
    miProductId,
    product: product as unknown as Record<string, unknown>,
  })

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
        error: 'Request body must be a JSON object with event and items[].',
      },
      { status: 400 },
    )
  }

  if (payload.items.length === 0) {
    return json(
      {
        error: 'Request body must contain at least one item.',
      },
      { status: 400 },
    )
  }

  const results: MicroinvestWebhookItemResult[] = []

  for (const [index, item] of payload.items.entries()) {
    results.push(await processWebhookItem({ event: payload.event, index, item, req }))
  }

  const hasErrors = results.some((result) => result.status >= 400)
  const hasSuccess = results.some((result) => result.status < 400)
  const firstErrorStatus = results.find((result) => result.status >= 400)?.status ?? 400

  return json(
    {
      message: hasErrors
        ? 'Webhook processed with item-level errors.'
        : 'Webhook processed successfully.',
      processed: results.length,
      results,
    },
    { status: hasErrors && hasSuccess ? 207 : hasErrors ? firstErrorStatus : 200 },
  )
}
