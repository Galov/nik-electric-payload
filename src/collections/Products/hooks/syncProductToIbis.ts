import type { CollectionAfterChangeHook, Payload } from 'payload'

type SyncEvent = 'product.created' | 'product.price_stock_updated'

type NormalizedImage = {
  alt?: string
  legacyUrl: string
}

type SyncItem = {
  sourceId?: number
  sku: string
  data: {
    title?: string
    description?: string
    shortDescription?: string
    originalSku?: string
    manufacturerCode?: string
    sourcePrice: number
    stockQty?: number
    published?: boolean
    legacyProductUrl?: string
    legacyModifiedAt?: string
    brand?: {
      sourceTermId: number
    }
    categories?: Array<{
      sourceTermId: number
    }>
    images?: NormalizedImage[]
  }
}

const getWebhookConfig = () => {
  const url = process.env.IBIS_SYNC_WEBHOOK_URL?.trim()
  const secret = process.env.IBIS_SYNC_WEBHOOK_SECRET?.trim()

  if (!url || !secret) {
    return null
  }

  return { secret, url }
}

const getPositiveNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

const getNonNegativeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

const getString = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const normalizeImages = (value: unknown): NormalizedImage[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((image) => {
      const legacyUrl = getString((image as { legacyUrl?: unknown } | null)?.legacyUrl)
      const alt = getString((image as { alt?: unknown } | null)?.alt)

      if (!legacyUrl) {
        return null
      }

      return {
        ...(alt ? { alt } : {}),
        legacyUrl,
      }
    })
    .filter((image): image is NormalizedImage => Boolean(image))
}

const areImagesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeImages(left)) === JSON.stringify(normalizeImages(right))

const getSourceId = (doc: Record<string, unknown>) => {
  const sourceId = getPositiveNumber(doc.sourceId)

  if (sourceId !== null) {
    return sourceId
  }

  const miProductId = getPositiveNumber(doc.miProductId)

  return miProductId
}

const normalizeRelationIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    if (typeof value === 'string') return [value]
    return []
  }

  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        return (item as { id: string }).id
      }
      return null
    })
    .filter((item): item is string => Boolean(item))
}

const resolveBrandPayload = async ({
  payload,
  value,
}: {
  payload: Payload
  value: unknown
}) => {
  const relationIds = normalizeRelationIds(value)

  if (!relationIds.length) {
    return null
  }

  const result = await payload.find({
    collection: 'brands',
    depth: 0,
    limit: relationIds.length,
    overrideAccess: true,
    pagination: false,
    select: {
      sourceTermId: true,
    },
    where: {
      id: {
        in: relationIds,
      },
    },
  })

  const sourceTermId = result.docs
    .map((doc) =>
      typeof doc.sourceTermId === 'number' && Number.isInteger(doc.sourceTermId)
        ? doc.sourceTermId
        : null,
    )
    .find((value): value is number => value !== null)

  return sourceTermId ? { sourceTermId } : null
}

const resolveCategoriesPayload = async ({
  payload,
  value,
}: {
  payload: Payload
  value: unknown
}) => {
  const relationIds = normalizeRelationIds(value)

  if (!relationIds.length) {
    return []
  }

  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: relationIds.length,
    overrideAccess: true,
    pagination: false,
    select: {
      sourceTermId: true,
    },
    where: {
      id: {
        in: relationIds,
      },
    },
  })

  return result.docs
    .map((doc) =>
      typeof doc.sourceTermId === 'number' && Number.isInteger(doc.sourceTermId)
        ? { sourceTermId: doc.sourceTermId }
        : null,
    )
    .filter((item): item is { sourceTermId: number } => Boolean(item))
}

const buildCreatedItem = async ({
  doc,
  payload,
}: {
  doc: Record<string, unknown>
  payload: Payload
}) => {
  const sku = getString(doc.sku)
  const sourceId = getSourceId(doc)
  const title = getString(doc.title)
  const sourcePrice = getPositiveNumber(doc.priceRetail)
  const stockQty = getNonNegativeNumber(doc.stockQty)

  if (!sku || sourceId === null || !title || sourcePrice === null || stockQty === null) {
    return null
  }

  const brand = await resolveBrandPayload({
    payload,
    value: doc.brand,
  })
  const categories = await resolveCategoriesPayload({
    payload,
    value: doc.categories,
  })
  const images = normalizeImages(doc.images)

  return {
    sourceId,
    sku,
    data: {
      ...(brand ? { brand } : {}),
      ...(categories.length ? { categories } : {}),
      ...(getString(doc.description) ? { description: getString(doc.description) as string } : {}),
      ...(images.length ? { images } : {}),
      ...(getString(doc.legacyModifiedAt)
        ? { legacyModifiedAt: getString(doc.legacyModifiedAt) as string }
        : {}),
      ...(getString(doc.legacyProductUrl)
        ? { legacyProductUrl: getString(doc.legacyProductUrl) as string }
        : {}),
      ...(getString(doc.manufacturerCode)
        ? { manufacturerCode: getString(doc.manufacturerCode) as string }
        : {}),
      ...(getString(doc.originalSku) ? { originalSku: getString(doc.originalSku) as string } : {}),
      ...(typeof doc.published === 'boolean' ? { published: doc.published } : {}),
      ...(getString(doc.shortDescription)
        ? { shortDescription: getString(doc.shortDescription) as string }
        : {}),
      sourcePrice,
      stockQty,
      title,
    },
  } satisfies SyncItem
}

const buildPriceStockItem = ({
  doc,
  includeImages,
}: {
  doc: Record<string, unknown>
  includeImages: boolean
}) => {
  const sku = getString(doc.sku)
  const sourceId = getSourceId(doc)
  const sourcePrice = getPositiveNumber(doc.priceRetail)
  const stockQty = getNonNegativeNumber(doc.stockQty)

  if (!sku || sourcePrice === null) {
    return null
  }

  return {
    ...(sourceId !== null ? { sourceId } : {}),
    sku,
    data: {
      ...(includeImages ? { images: normalizeImages(doc.images) } : {}),
      ...(stockQty !== null ? { stockQty } : {}),
      sourcePrice,
    },
  } satisfies SyncItem
}

const sendWebhook = async ({
  event,
  items,
}: {
  event: SyncEvent
  items: SyncItem[]
}) => {
  const config = getWebhookConfig()

  if (!config || !items.length) {
    return
  }

  const response = await fetch(config.url, {
    body: JSON.stringify({
      event,
      items,
    }),
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': config.secret,
    },
    method: 'POST',
  })

  if (response.ok) {
    return
  }

  const responseText = await response.text().catch(() => '')
  throw new Error(
    `Ibis sync failed with status ${response.status}${responseText ? `: ${responseText}` : '.'}`,
  )
}

export const syncProductToIbisHook: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  try {
    const normalizedDoc = doc as Record<string, unknown>

    if (operation === 'create') {
      const item = await buildCreatedItem({
        doc: normalizedDoc,
        payload: req.payload,
      })

      if (!item) {
        req.payload.logger.warn(
          `Skipped Ibis product.created sync for product ${String(doc.id)} because required fields are missing.`,
        )
        return doc
      }

      await sendWebhook({
        event: 'product.created',
        items: [item],
      })

      return doc
    }

    if (operation !== 'update' || !previousDoc) {
      return doc
    }

    const normalizedPreviousDoc = previousDoc as Record<string, unknown>
    const priceChanged = normalizedDoc.priceRetail !== normalizedPreviousDoc.priceRetail
    const stockChanged = normalizedDoc.stockQty !== normalizedPreviousDoc.stockQty
    const imagesChanged = !areImagesEqual(normalizedDoc.images, normalizedPreviousDoc.images)

    if (!priceChanged && !stockChanged && !imagesChanged) {
      return doc
    }

    const item = buildPriceStockItem({
      doc: normalizedDoc,
      includeImages: imagesChanged,
    })

    if (!item) {
      req.payload.logger.warn(
        `Skipped Ibis product.price_stock_updated sync for product ${String(doc.id)} because required fields are missing.`,
      )
      return doc
    }

    await sendWebhook({
      event: 'product.price_stock_updated',
      items: [item],
    })
  } catch (error) {
    req.payload.logger.error(
      `Ibis sync failed for product ${String(doc.id)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  return doc
}
