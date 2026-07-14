import 'dotenv/config'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

const WRITE = process.argv.includes('--write')

const main = async () => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    select: {
      email: true,
      registrationStatus: true,
    },
    where: {
      or: [
        {
          registrationStatus: {
            equals: 'pending',
          },
        },
        {
          registrationStatus: {
            exists: false,
          },
        },
      ],
    },
  })

  let updated = 0

  for (const user of result.docs) {
    if (!WRITE) {
      continue
    }

    await payload.update({
      id: user.id,
      collection: 'users',
      context: {
        skipCustomerApprovedEmail: true,
      },
      data: {
        approved: true,
        registrationStatus: 'approved',
      },
      overrideAccess: true,
      showHiddenFields: true,
    })

    updated += 1
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !WRITE,
        matched: result.docs.length,
        updated,
        sample: result.docs.slice(0, 10).map((user) => ({
          email: user.email,
          id: user.id,
          registrationStatus: user.registrationStatus,
        })),
      },
      null,
      2,
    ),
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
