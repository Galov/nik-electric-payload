import 'dotenv/config'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const batchSize = 250
const shouldWrite = process.argv.includes('--write')
const shouldTrimTail = process.argv.includes('--trim-tail')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeTitle = ({
  sku,
  title,
}: {
  sku?: null | string
  title: string
}) => {
  let nextTitle = title.trim()
  const normalizedSKU = sku?.trim()
  const leadingMarker = normalizedSKU ? `${normalizedSKU} - ` : null

  if (leadingMarker && nextTitle.startsWith(leadingMarker)) {
    nextTitle = nextTitle.slice(leadingMarker.length).trim()
  }

  if (!shouldTrimTail) {
    return nextTitle
  }

  const originalHyphenCount = (nextTitle.match(/-/g) || []).length

  if (originalHyphenCount === 0) {
    return nextTitle
  }

  const lastSeparatorIndex = nextTitle.lastIndexOf('-')

  if (lastSeparatorIndex >= 0) {
    nextTitle = nextTitle.slice(0, lastSeparatorIndex).trim()
  }

  return nextTitle
}

const updateProductTitle = async ({
  id,
  nextTitle,
  payload,
}: {
  id: string
  nextTitle: string
  payload: Awaited<ReturnType<typeof getPayload>>
}) => {
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await payload.update({
        id,
        collection: 'products',
        context: {
          skipIbisProductSync: true,
        },
        data: {
          title: nextTitle,
        },
        overrideAccess: true,
      })

      return
    } catch (error) {
      const isWriteConflict =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 112

      if (!isWriteConflict || attempt === maxAttempts) {
        throw error
      }

      await sleep(250 * attempt)
    }
  }
}

const syncTitles = async () => {
  const payload = await getPayload({ config: configPromise })

  let page = 1
  let processed = 0
  let updated = 0
  const samples: Array<{ id: string; from: string; to: string }> = []

  while (true) {
    const result = await payload.find({
      collection: 'products',
      depth: 0,
      limit: batchSize,
      page,
      overrideAccess: true,
      pagination: true,
      select: {
        id: true,
        sku: true,
        title: true,
      },
      sort: 'id',
    })

    for (const product of result.docs) {
      processed += 1

      const currentTitle = typeof product.title === 'string' ? product.title.trim() : ''

      if (!currentTitle) {
        continue
      }

      const nextTitle = normalizeTitle({
        sku: typeof product.sku === 'string' ? product.sku : null,
        title: currentTitle,
      })

      if (!nextTitle || nextTitle === currentTitle) {
        continue
      }

      if (samples.length < 25) {
        samples.push({
          from: currentTitle,
          id: product.id,
          to: nextTitle,
        })
      }

      if (shouldWrite) {
        await updateProductTitle({
          id: product.id,
          nextTitle,
          payload,
        })
      }

      updated += 1
    }

    if (!result.hasNextPage) {
      break
    }

    page += 1
  }

  console.log(
    JSON.stringify(
      {
        mode: shouldWrite ? 'write' : 'dry-run',
        trimTail: shouldTrimTail,
        processed,
        samples,
        updated,
      },
      null,
      2,
    ),
  )
}

void syncTitles()
