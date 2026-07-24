import 'dotenv/config'

import { MongoClient, ObjectId, type Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const KEEP_PER_PRODUCT = 3
const BATCH_SIZE = 1000

type RankedVersion = {
  _id: ObjectId
}

const versionsToPrunePipeline: Document[] = [
  {
    $sort: {
      parent: 1,
      updatedAt: -1,
      _id: -1,
    },
  },
  {
    $group: {
      _id: '$parent',
      versionIDs: {
        $push: '$_id',
      },
    },
  },
  {
    $project: {
      versionIDs: {
        $slice: ['$versionIDs', KEEP_PER_PRODUCT, { $size: '$versionIDs' }],
      },
    },
  },
  {
    $unwind: '$versionIDs',
  },
  {
    $project: {
      _id: '$versionIDs',
    },
  },
]

const main = async () => {
  const databaseURL = process.env.DATABASE_URL

  if (!databaseURL) {
    throw new Error('DATABASE_URL is required.')
  }

  const client = new MongoClient(databaseURL)
  await client.connect()

  try {
    const versions = client.db().collection('_products_versions')
    const before = await versions.countDocuments()
    const countResult = await versions
      .aggregate<{ count: number }>([...versionsToPrunePipeline, { $count: 'count' }], {
        allowDiskUse: true,
      })
      .next()
    const wouldDelete = countResult?.count || 0

    let deleted = 0

    if (APPLY && wouldDelete > 0) {
      const cursor = versions.aggregate<RankedVersion>(versionsToPrunePipeline, {
        allowDiskUse: true,
      })
      let batch: ObjectId[] = []

      for await (const version of cursor) {
        batch.push(version._id)

        if (batch.length < BATCH_SIZE) continue

        const result = await versions.deleteMany({
          _id: {
            $in: batch,
          },
        })

        deleted += result.deletedCount
        batch = []
      }

      if (batch.length > 0) {
        const result = await versions.deleteMany({
          _id: {
            $in: batch,
          },
        })

        deleted += result.deletedCount
      }
    }

    const after = APPLY ? await versions.countDocuments() : before

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          before,
          deleted,
          after,
          keepPerProduct: KEEP_PER_PRODUCT,
          wouldDelete,
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
