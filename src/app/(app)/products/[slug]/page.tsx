import { redirect } from 'next/navigation'

type Args = {
  params: Promise<{
    slug: string
  }>
}

export default async function LegacyProductRedirectPage({ params }: Args) {
  const { slug } = await params

  redirect(`/product/${slug}`)
}
