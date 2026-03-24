import type { Metadata } from 'next'

import { getSocialImageURL } from '@/utilities/getSocialImageURL'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: 'Каталог с продукти, партньори и информация за Ник Електрик.',
  images: [
    {
      url: getSocialImageURL('/logo.png'),
    },
  ],
  siteName: 'Ник Електрик',
  title: 'Ник Електрик',
}

export const mergeOpenGraph = (og?: Partial<Metadata['openGraph']>): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
