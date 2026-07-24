import 'dotenv/config'

import { MongoClient, type Document } from 'mongodb'

const APPLY = process.argv.includes('--apply')

const buildHasImagesExpression = (imagesPath: string): Document => ({
  $anyElementTrue: {
    $map: {
      input: {
        $ifNull: [imagesPath, []],
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
})

const productHasImagesExpression = buildHasImagesExpression('$images')
const versionHasImagesExpression = buildHasImagesExpression('$version.images')

const main = async () => {
  const databaseURL = process.env.DATABASE_URL

  if (!databaseURL) {
    throw new Error('DATABASE_URL is required.')
  }

  const client = new MongoClient(databaseURL)
  await client.connect()

  try {
    const products = client.db().collection('products')
    const versions = client.db().collection('_products_versions')
    const summary = await products
      .aggregate<{
        _id: boolean
        count: number
      }>([
        {
          $project: {
            hasImages: productHasImagesExpression,
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

    let matchedProducts = 0
    let matchedVersions = 0
    let modifiedProducts = 0
    let modifiedVersions = 0

    if (APPLY) {
      const productResult = await products.updateMany({}, [
        {
          $set: {
            hasImages: productHasImagesExpression,
          },
        },
      ])
      const versionResult = await versions.updateMany({}, [
        {
          $set: {
            'version.hasImages': versionHasImagesExpression,
          },
        },
      ])

      matchedProducts = productResult.matchedCount
      matchedVersions = versionResult.matchedCount
      modifiedProducts = productResult.modifiedCount
      modifiedVersions = versionResult.modifiedCount
    }

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          matchedProducts,
          matchedVersions,
          modifiedProducts,
          modifiedVersions,
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
