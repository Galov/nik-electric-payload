import 'dotenv/config'

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

const QUERY_PRESETS_COLLECTION = 'payload-query-presets'

type QueryPresetSeed = {
  columns?: Array<{ accessor: string; active: boolean }>
  relatedCollection: string
  title: string
  where: Where
}

const sharedAccess = {
  delete: {
    constraint: 'everyone',
  },
  read: {
    constraint: 'everyone',
  },
  update: {
    constraint: 'everyone',
  },
}

const presets: QueryPresetSeed[] = [
  {
    title: 'Продукти без Microinvest ID',
    relatedCollection: 'products',
    where: {
      or: [
        {
          miProductId: {
            exists: false,
          },
        },
        {
          miProductId: {
            equals: null,
          },
        },
      ],
    },
  },
  {
    title: 'Налични, но скрити продукти',
    relatedCollection: 'products',
    where: {
      and: [
        {
          published: {
            equals: false,
          },
        },
        {
          stockQty: {
            greater_than: 0,
          },
        },
      ],
    },
  },
  {
    title: 'Грешни поръчки към Microinvest',
    relatedCollection: 'orders',
    where: {
      miOrderExportStatus: {
        equals: 'failed',
      },
    },
  },
  {
    title: 'Задържани поръчки',
    relatedCollection: 'orders',
    where: {
      status: {
        equals: 'held',
      },
    },
  },
  {
    title: 'Неприключени поръчки',
    relatedCollection: 'orders',
    where: {
      status: {
        not_equals: 'completed',
      },
    },
  },
]

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const results: Array<{ action: 'created' | 'updated'; id: string; title: string }> = []

  for (const preset of presets) {
    const existing = await payload.find({
      collection: QUERY_PRESETS_COLLECTION as any,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          {
            title: {
              equals: preset.title,
            },
          },
          {
            relatedCollection: {
              equals: preset.relatedCollection,
            },
          },
        ],
      },
    })

    const data = {
      ...preset,
      access: sharedAccess,
      columns: preset.columns || [],
      isShared: true,
    }

    if (existing.docs[0]) {
      const updated = await payload.update({
        id: existing.docs[0].id,
        collection: QUERY_PRESETS_COLLECTION as any,
        data,
        overrideAccess: true,
      })

      results.push({ action: 'updated', id: String(updated.id), title: preset.title })
      continue
    }

    const created = await payload.create({
      collection: QUERY_PRESETS_COLLECTION as any,
      data,
      overrideAccess: true,
    })

    results.push({ action: 'created', id: String(created.id), title: preset.title })
  }

  console.log(JSON.stringify({ presets: results }, null, 2))
}

void main()
