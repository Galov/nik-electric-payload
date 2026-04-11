import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'

type SyncEvent =
  | 'product.created'
  | 'product.price_stock_updated'
  | 'product.deleted'

type NormalizedImage = {
  alt?: string
  legacyUrl: string
}

type SyncItem = {
  sourceId?: number
  sku: string
  data?: {
    title?: string
    description?: string
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

const getIdentifierString = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toString?: unknown }).toString === 'function'
  ) {
    const stringified = (value as { toString: () => string }).toString().trim()

    if (stringified && stringified !== '[object Object]') {
      return stringified
    }
  }

  return null
}

const serverURL =
  process.env.NEXT_PUBLIC_SERVER_URL?.trim() || process.env.PAYLOAD_PUBLIC_SERVER_URL?.trim() || ''

const toAbsoluteURL = (value: string) => {
  if (/^https?:\/\//i.test(value)) {
    return value
  }

  if (!serverURL) {
    return value
  }

  return `${serverURL.replace(/\/$/, '')}/${value.replace(/^\//, '')}`
}

const getMediaID = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  return (
    getIdentifierString(value) ||
    getIdentifierString((value as { id?: unknown }).id) ||
    getIdentifierString((value as { _id?: unknown })._id) ||
    null
  )
}

const getMediaURL = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const url = getString((value as { url?: unknown }).url)

  return url ? toAbsoluteURL(url) : null
}

const serializeImages = (value: unknown) => {
  if (!Array.isArray(value)) {
    return '[]'
  }

  return JSON.stringify(
    value.map((image) => ({
      alt: getString((image as { alt?: unknown } | null)?.alt),
      legacyUrl: getString((image as { legacyUrl?: unknown } | null)?.legacyUrl),
      media:
        typeof (image as { media?: unknown } | null)?.media === 'string'
          ? (image as { media?: string }).media
          : typeof (image as { media?: unknown } | null)?.media === 'object'
            ? getMediaID((image as { media?: unknown }).media) || getMediaURL((image as { media?: unknown }).media)
            : null,
      storageKey: getString((image as { storageKey?: unknown } | null)?.storageKey),
    })),
  )
}

const areImagesEqual = (left: unknown, right: unknown) => serializeImages(left) === serializeImages(right)

const resolveMediaImageMap = async ({
  payload,
  value,
}: {
  payload: Payload
  value: unknown
}) => {
  if (!Array.isArray(value)) {
    return new Map<string, { alt?: string; url: string }>()
  }

  const mediaIDs = value
    .map((image) => {
      const media = (image as { media?: unknown } | null)?.media

      if (typeof media === 'string') {
        return media
      }

      if (media && typeof media === 'object') {
        return getMediaID(media)
      }

      return null
    })
    .filter((id): id is string => Boolean(id))

  if (!mediaIDs.length) {
    return new Map<string, { alt?: string; url: string }>()
  }

  const uniqueMediaIDs = [...new Set(mediaIDs)]
  const mediaDocs = await Promise.all(
    uniqueMediaIDs.map(async (id) => {
      try {
        const doc = await payload.findByID({
          collection: 'media',
          id,
          depth: 0,
          overrideAccess: true,
        })

        return doc
      } catch {
        return null
      }
    }),
  )

  return new Map(
    mediaDocs
      .map((doc, index) => {
        if (!doc || typeof doc.url !== 'string' || !doc.url) {
          return null
        }

        return [
          uniqueMediaIDs[index] as string,
          {
            ...(getString(doc.alt) ? { alt: getString(doc.alt) as string } : {}),
            url: toAbsoluteURL(doc.url),
          },
        ] as const
      })
      .filter((entry): entry is readonly [string, { alt?: string; url: string }] => Boolean(entry)),
  )
}

const normalizeImages = async ({
  payload,
  value,
}: {
  payload: Payload
  value: unknown
}): Promise<NormalizedImage[]> => {
  if (!Array.isArray(value)) {
    return []
  }

  const mediaMap = await resolveMediaImageMap({
    payload,
    value,
  })

  return value
    .map((image) => {
      const legacyUrl = getString((image as { legacyUrl?: unknown } | null)?.legacyUrl)
      const alt = getString((image as { alt?: unknown } | null)?.alt)
      const media = (image as { media?: unknown } | null)?.media
      const mediaID =
        typeof media === 'string'
          ? media
          : media && typeof media === 'object'
            ? getMediaID(media)
            : null
      const mediaImage = mediaID ? mediaMap.get(mediaID) : null
      const inlineMediaUrl = media && typeof media === 'object' ? getMediaURL(media) : null
      const inlineMediaAlt =
        media && typeof media === 'object' ? getString((media as { alt?: unknown }).alt) : null
      const resolvedUrl = mediaImage?.url || inlineMediaUrl || legacyUrl || null

      if (!resolvedUrl) {
        return null
      }

      return {
        ...(alt || mediaImage?.alt || inlineMediaAlt
          ? { alt: alt || mediaImage?.alt || inlineMediaAlt }
          : {}),
        legacyUrl: resolvedUrl,
      }
    })
    .filter((image): image is NormalizedImage => Boolean(image))
}

const getSourceId = (doc: Record<string, unknown>) => {
  const sourceId = getPositiveNumber(doc.sourceId)

  if (sourceId !== null) {
    return sourceId
  }

  const miProductId = getPositiveNumber(doc.miProductId)

  if (miProductId !== null) {
    return miProductId
  }

  const docId =
    typeof doc.id === 'string' && /^\d+$/.test(doc.id)
      ? Number(doc.id)
      : getPositiveNumber(doc.id)

  return docId
}

const hasRequiredCreateFields = (doc: Record<string, unknown>) => {
  const sku = getString(doc.sku)
  const title = getString(doc.title)
  const sourcePrice = getNonNegativeNumber(doc.priceRetail)
  const stockQty = getNonNegativeNumber(doc.stockQty)

  return Boolean(sku && title && sourcePrice !== null && stockQty !== null)
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
  if (!hasRequiredCreateFields(doc)) {
    return null
  }

  const sku = getString(doc.sku) as string
  const sourceId = getSourceId(doc)
  const title = getString(doc.title) as string
  const sourcePrice = getNonNegativeNumber(doc.priceRetail) as number
  const stockQty = getNonNegativeNumber(doc.stockQty) as number

  const brand = await resolveBrandPayload({
    payload,
    value: doc.brand,
  })
  const categories = await resolveCategoriesPayload({
    payload,
    value: doc.categories,
  })
  const images = await normalizeImages({
    payload,
    value: doc.images,
  })

  return {
    ...(sourceId !== null ? { sourceId } : {}),
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
      sourcePrice,
      stockQty,
      title,
    },
  } satisfies SyncItem
}

const buildPriceStockItem = async ({
  doc,
  includeImages,
  includePublished,
  payload,
}: {
  doc: Record<string, unknown>
  includeImages: boolean
  includePublished: boolean
  payload: Payload
}) => {
  const sku = getString(doc.sku)
  const sourceId = getSourceId(doc)
  const sourcePrice = getNonNegativeNumber(doc.priceRetail)
  const stockQty = getNonNegativeNumber(doc.stockQty)

  if (!sku || sourcePrice === null) {
    return null
  }

  return {
    ...(sourceId !== null ? { sourceId } : {}),
    sku,
    data: {
      ...(includeImages
        ? {
            images: await normalizeImages({
              payload,
              value: doc.images,
            }),
          }
        : {}),
      ...(includePublished && typeof doc.published === 'boolean' ? { published: doc.published } : {}),
      ...(stockQty !== null ? { stockQty } : {}),
      sourcePrice,
    },
  } satisfies SyncItem
}

const buildIdentifierItem = ({
  doc,
}: {
  doc: Record<string, unknown>
}) => {
  const sku = getString(doc.sku)
  const sourceId = getSourceId(doc)

  if (!sku) {
    return null
  }

  return {
    ...(sourceId !== null ? { sourceId } : {}),
    sku,
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
    const becameSyncable = hasRequiredCreateFields(normalizedDoc) && !hasRequiredCreateFields(normalizedPreviousDoc)

    if (becameSyncable) {
      const item = await buildCreatedItem({
        doc: normalizedDoc,
        payload: req.payload,
      })

      if (item) {
        await sendWebhook({
          event: 'product.created',
          items: [item],
        })

        return doc
      }
    }

    const priceChanged = normalizedDoc.priceRetail !== normalizedPreviousDoc.priceRetail
    const stockChanged = normalizedDoc.stockQty !== normalizedPreviousDoc.stockQty
    const imagesChanged = !areImagesEqual(normalizedDoc.images, normalizedPreviousDoc.images)
    const publishedChanged = normalizedDoc.published !== normalizedPreviousDoc.published

    if (!priceChanged && !stockChanged && !imagesChanged && !publishedChanged) {
      return doc
    }

    const item = await buildPriceStockItem({
      doc: normalizedDoc,
      includeImages: imagesChanged,
      includePublished: publishedChanged,
      payload: req.payload,
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

export const syncDeletedProductToIbisHook: CollectionAfterDeleteHook = async ({ doc, req }) => {
  try {
    const item = buildIdentifierItem({
      doc: doc as Record<string, unknown>,
    })

    if (!item) {
      req.payload.logger.warn(
        `Skipped Ibis product.deleted sync for product ${String(doc.id)} because required fields are missing.`,
      )
      return doc
    }

    await sendWebhook({
      event: 'product.deleted',
      items: [item],
    })
  } catch (error) {
    req.payload.logger.error(
      `Ibis delete sync failed for product ${String(doc.id)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }

  return doc
}
