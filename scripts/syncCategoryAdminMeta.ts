import configPromise from '@payload-config'
import { syncCategoryAdminMeta } from '@/collections/Categories/hooks/syncCategoryAdminMeta'
import { getPayload } from 'payload'

const run = async () => {
  const payload = await getPayload({ config: configPromise })

  await syncCategoryAdminMeta(payload)

  console.log('Category admin labels synced.')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
