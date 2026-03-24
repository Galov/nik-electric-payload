import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound, redirect } from 'next/navigation'

import { buildCategoryPublicSegments } from '@/utilities/category'

type Args = {
  params: Promise<{
    slug: string[]
  }>
}

type CategoryPageData = {
  id: string
  parent?:
    | {
        parent?: CategoryPageData['parent']
        slug?: string | null
        title?: string | null
      }
    | string
    | null
  slug?: string | null
  title: string
}

export default async function CategoryPage({ params }: Args) {
  const { slug } = await params
  const category = await queryCategoryBySegments({ segments: slug })

  if (!category) return notFound()

  redirect(`/shop?category=${encodeURIComponent(category.id)}#catalog`)
}

const queryCategoryBySegments = async ({ segments }: { segments: string[] }) => {
  const requestedSegments = segments.map((segment) => decodeURIComponent(segment))
  const lastSegment = requestedSegments.at(-1)

  if (!lastSegment) return null

  const previousSegment = requestedSegments.at(-2)
  const targetSlug =
    previousSegment && lastSegment.startsWith(`${previousSegment}-`)
      ? lastSegment.slice(previousSegment.length + 1)
      : lastSegment

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'categories',
    depth: 10,
    limit: 100,
    pagination: false,
    where: {
      slug: {
        equals: targetSlug,
      },
    },
  })

  const category =
    (result.docs as CategoryPageData[]).find((doc) => {
      const actualSegments = buildCategoryPublicSegments(doc)

      return actualSegments.join('/') === requestedSegments.join('/')
    }) || null

  return category
}
