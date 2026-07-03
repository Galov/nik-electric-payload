import 'dotenv/config'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const ids = ['69d38f0eaee9eefaf1f4117b', '69d38f16aee9eefaf1f41261']

const main = async () => {
  const payload = await getPayload({ config: configPromise })

  for (const id of ids) {
    await payload.delete({
      collection: 'products',
      id,
      overrideAccess: true,
    })
  }

  const remaining = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 10,
    overrideAccess: true,
    pagination: false,
    where: {
      id: {
        in: ids,
      },
    },
  })

  console.log(
    JSON.stringify(
      {
        deletedIds: ids,
        remaining: remaining.docs.length,
      },
      null,
      2,
    ),
  )
}

void main()
