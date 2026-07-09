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

const parsePublicSegmentsToSlugs = (segments: string[]) =>
  segments.reduce<string[]>((acc, segment) => {
    if (acc.length === 0) {
      acc.push(segment)
      return acc
    }

    const previousPublicSegment = segments[acc.length - 1]
    const slug =
      previousPublicSegment && segment.startsWith(`${previousPublicSegment}-`)
        ? segment.slice(previousPublicSegment.length + 1)
        : segment

    acc.push(slug)
    return acc
  }, [])

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

  const candidates = result.docs as CategoryPageData[]
  const requestedPath = requestedSegments.join('/')
  const requestedSlugs = parsePublicSegmentsToSlugs(requestedSegments)
  const category =
    candidates.find((doc) => buildCategoryPublicSegments(doc).join('/') === requestedPath) ||
    candidates.find((doc) => {
      const actualSlugs = buildCategoryPublicSegments(doc)
        .map((_, index, actualSegments) =>
          parsePublicSegmentsToSlugs(actualSegments.slice(0, index + 1)).at(-1),
        )
        .filter((segment): segment is string => Boolean(segment))
      const actualSuffix = actualSlugs.slice(-requestedSlugs.length)

      return actualSuffix.join('/') === requestedSlugs.join('/')
    }) ||
    null

  return category
}
