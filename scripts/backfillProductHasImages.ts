import 'dotenv/config'

import { MongoClient, type Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')

const hasImagesExpression: Document = {
  $anyElementTrue: {
    $map: {
      input: {
        $ifNull: ['$images', []],
      },
      as: 'image',
      in: {
        $or: [
          {
            $ne: [
              {
                $ifNull: ['$$image.media', null],
              },
              null,
            ],
          },
          {
            $gt: [
              {
                $strLenCP: {
                  $ifNull: ['$$image.storageKey', ''],
                },
              },
              0,
            ],
          },
          {
            $gt: [
              {
                $strLenCP: {
                  $ifNull: ['$$image.legacyUrl', ''],
                },
              },
              0,
            ],
          },
        ],
      },
    },
  },
}

const main = async () => {
  const databaseURL = process.env.DATABASE_URL

  if (!databaseURL) {
    throw new Error('DATABASE_URL is required.')
  }

  const client = new MongoClient(databaseURL)
  await client.connect()

  try {
    const products = client.db().collection('products')
    const summary = await products
      .aggregate<{
        _id: boolean
        count: number
      }>([
        {
          $project: {
            hasImages: hasImagesExpression,
          },
        },
        {
          $group: {
            _id: '$hasImages',
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            _id: -1,
          },
        },
      ])
      .toArray()

    let matched = 0
    let modified = 0

    if (APPLY) {
      const result = await products.updateMany({}, [
        {
          $set: {
            hasImages: hasImagesExpression,
          },
        },
      ])

      matched = result.matchedCount
      modified = result.modifiedCount
    }

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          matched,
          modified,
          summary: Object.fromEntries(
            summary.map((row) => [row._id ? 'withImages' : 'withoutImages', row.count]),
          ),
        },
        null,
        2,
      ),
    )
  } finally {
    await client.close()
  }
}

void main()
