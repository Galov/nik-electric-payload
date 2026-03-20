import type { Product } from '@/payload-types'

const publicStorageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || ''

export const resolveProductImageURL = (image?: {
  legacyUrl?: null | string
  storageKey?: null | string
}) => {
  if (image?.storageKey && publicStorageBase) {
    return `${publicStorageBase.replace(/\/$/, '')}/${image.storageKey.replace(/^\//, '')}`
  }

  return image?.legacyUrl || ''
}

export const getProductPrimaryImage = (product?: Partial<Product> | null) => {
  const image = product?.images?.[0]

  if (!image) {
    return null
  }

  return {
    alt: image.alt || product?.title || '',
    url: resolveProductImageURL(image),
  }
}

export const isVisibleProduct = (product?: Partial<Product> | null) => {
  return Boolean(product?.published)
}
