import type { Product } from '@/payload-types'

import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'
import { parseMicroinvestDescription, type ProductTypeValue } from '@/utilities/microinvest'

const publicStorageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || ''

const clampText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value

  return `${value.slice(0, maxLength).trimEnd()}...`
}

export const getProductImageAlt = ({
  imageAlt,
  mediaAlt,
  index = 0,
  productTitle,
}: {
  imageAlt?: null | string
  mediaAlt?: null | string
  index?: number
  productTitle?: null | string
}) => {
  if (imageAlt?.trim()) {
    return imageAlt.trim()
  }

  if (mediaAlt?.trim()) {
    return mediaAlt.trim()
  }

  if (productTitle?.trim()) {
    return index > 0
      ? `${productTitle.trim()} - изображение ${index + 1}`
      : productTitle.trim()
  }

  return ''
}

export const getProductSEODescription = (product?: Partial<Product> | null) => {
  const normalizedDescription = formatLegacyProductDescription(product?.description)

  if (normalizedDescription) {
    return clampText(normalizedDescription, 180)
  }

  const brand = getProductBrands(product)[0]?.title || null
  const primaryCategory =
    product?.categories?.find(
      (category): category is Exclude<NonNullable<Product['categories']>[number], string> =>
        Boolean(category && typeof category !== 'string' && category.title),
    ) || null

  const metaParts = [
    product?.title?.trim(),
    brand?.trim() || null,
    primaryCategory?.title?.trim() || null,
    product?.sku?.trim() ? `Код ${product.sku.trim()}` : null,
  ].filter(Boolean)

  if (metaParts.length > 0) {
    return clampText(`${metaParts.join(' · ')} в каталога на Ник Електрик.`, 180)
  }

  return 'Разгледайте продукта в каталога на Ник Електрик.'
}

export const resolveProductImageURL = (image?: {
  legacyUrl?: null | string
  media?:
    | string
    | {
        url?: null | string
      }
    | null
  storageKey?: null | string
}) => {
  if (image?.storageKey && publicStorageBase) {
    return `${publicStorageBase.replace(/\/$/, '')}/${image.storageKey.replace(/^\//, '')}`
  }

  if (image?.media && typeof image.media === 'object' && image.media.url) {
    return image.media.url
  }

  return image?.legacyUrl || ''
}

export const getProductPrimaryImage = (product?: Partial<Product> | null) => {
  const image = product?.images?.[0]

  if (!image) {
    return null
  }

  return {
    alt: getProductImageAlt({
      imageAlt: image.alt,
      mediaAlt:
        image.media && typeof image.media === 'object' && 'alt' in image.media
          ? image.media.alt
          : null,
      productTitle: product?.title,
    }),
    url: resolveProductImageURL(image),
  }
}

export const isVisibleProduct = (product?: Partial<Product> | null) => {
  return Boolean(product?.published)
}

type BrandLike =
  | null
  | string
  | {
      id?: number | string
      slug?: null | string
      title?: null | string
    }

const normalizeBrandEntry = (brand: BrandLike) => {
  if (!brand || typeof brand === 'string' || !brand.title) {
    return null
  }

  return {
    id: typeof brand.id === 'string' ? brand.id : typeof brand.id === 'number' ? String(brand.id) : undefined,
    slug: brand.slug || undefined,
    title: brand.title,
  }
}

export const getProductBrands = (product?: Partial<Product> | null) => {
  const source = product?.brand

  if (Array.isArray(source)) {
    return source
      .map((brand) => normalizeBrandEntry(brand as BrandLike))
      .filter((brand): brand is NonNullable<ReturnType<typeof normalizeBrandEntry>> => Boolean(brand))
  }

  const singleBrand = normalizeBrandEntry(source as BrandLike)

  return singleBrand ? [singleBrand] : []
}

export const getProductType = (product?: Partial<Product> | null): null | ProductTypeValue => {
  const parsedOriginalSku = parseMicroinvestDescription(product?.originalSku)

  if (parsedOriginalSku?.productType) {
    return parsedOriginalSku.productType
  }

  const productType = (product as Partial<Product> & { productType?: null | ProductTypeValue })?.productType

  if (
    productType === 'compatible' ||
    productType === 'original' ||
    productType === 'removed-from-unit'
  ) {
    return productType
  }

  if (product?.isRefurbished) {
    return 'removed-from-unit'
  }

  return null
}
