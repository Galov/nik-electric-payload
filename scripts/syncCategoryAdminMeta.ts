import configPromise from '@payload-config'
import { syncCategoryAdminMeta } from '@/collections/Categories/hooks/syncCategoryAdminMeta'
import { syncCategoryProductCount } from '@/collections/Categories/hooks/syncCategoryProductCount'
import { getPayload } from 'payload'

const run = async () => {
  const payload = await getPayload({ config: configPromise })

  await syncCategoryAdminMeta(payload)
  await syncCategoryProductCount(payload)

  console.log('Category admin labels and product counts synced.')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
