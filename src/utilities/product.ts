import type { Media, Product } from '@/payload-types'

import { formatLegacyProductDescription } from '@/utilities/formatLegacyProductDescription'
import type { ProductTypeValue } from '@/utilities/microinvest'

export const PRODUCT_IMAGE_PLACEHOLDER_URL = '/product-placeholder.png'

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
    return index > 0 ? `${productTitle.trim()} - изображение ${index + 1}` : productTitle.trim()
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
  const publicStorageBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || ''

  if (image?.storageKey && publicStorageBase) {
    return `${publicStorageBase.replace(/\/$/, '')}/${image.storageKey.replace(/^\//, '')}`
  }

  if (image?.media && typeof image.media === 'object' && image.media.url) {
    return image.media.url
  }

  if (image?.storageKey) {
    return ''
  }

  return image?.legacyUrl || ''
}

export const getProductPrimaryImage = (product?: Partial<Product> | null) => {
  const image = product?.images?.[0]

  if (!image) {
    return {
      alt: getProductImageAlt({
        productTitle: product?.title,
      }),
      url: PRODUCT_IMAGE_PLACEHOLDER_URL,
    }
  }

  const imageUrl = resolveProductImageURL(image)

  return {
    alt: getProductImageAlt({
      imageAlt: image.alt,
      mediaAlt:
        image.media && typeof image.media === 'object' && 'alt' in image.media
          ? image.media.alt
          : null,
      productTitle: product?.title,
    }),
    url: imageUrl || PRODUCT_IMAGE_PLACEHOLDER_URL,
  }
}

export const isVisibleProduct = (product?: Partial<Product> | null) => {
  return Boolean(product?.published)
}

export const getAvailableProductQuantity = (product?: Partial<Product> | null) => {
  const stockQty = product?.stockQty
  const inventory = product?.inventory

  if (typeof stockQty === 'number' && Number.isFinite(stockQty)) {
    return stockQty
  }

  if (typeof inventory === 'number' && Number.isFinite(inventory)) {
    return inventory
  }

  return 0
}

export const isAvailableProduct = (product?: Partial<Product> | null) => {
  return Boolean(product?.published) && getAvailableProductQuantity(product) > 0
}

export const formatProductTitle = (value?: null | string) => {
  const title = value?.trim() || ''

  if (!title) {
    return ''
  }

  const [firstCharacter, ...rest] = Array.from(title)

  return `${firstCharacter.toLocaleUpperCase('bg-BG')}${rest.join('')}`
}

export const normalizeProductTitleFromSku = ({
  sku,
  title,
}: {
  sku?: null | string
  title?: null | string
}) => {
  const normalizedTitle = title?.trim() || ''
  const normalizedSku = sku?.trim()

  if (!normalizedTitle || !normalizedSku) {
    return normalizedTitle
  }

  const escapedSku = normalizedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const leadingSkuPattern = new RegExp(`^${escapedSku}\\s*[-–—]\\s*`, 'i')

  return normalizedTitle.replace(leadingSkuPattern, '').trim()
}

export const normalizeProductSlugPart = (value?: null | string) =>
  (value || '')
    .toLocaleLowerCase('bg-BG')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')

export const buildProductSlugFromTitleAndSku = ({
  sku,
  title,
}: {
  sku?: null | string
  title?: null | string
}) => {
  const titlePart = normalizeProductSlugPart(title) || 'product'
  const skuPart = normalizeProductSlugPart(sku)

  return skuPart ? `${titlePart}-${skuPart}` : titlePart
}

type BrandLike =
  | null
  | string
  | {
      id?: number | string
      logo?: Media | null | string
      slug?: null | string
      title?: null | string
    }

const normalizeBrandEntry = (brand: BrandLike) => {
  if (!brand || typeof brand === 'string' || !brand.title) {
    return null
  }

  return {
    id:
      typeof brand.id === 'string'
        ? brand.id
        : typeof brand.id === 'number'
          ? String(brand.id)
          : undefined,
    logo: brand.logo && typeof brand.logo === 'object' ? brand.logo : null,
    slug: brand.slug || undefined,
    title: brand.title,
  }
}

export const getProductBrands = (product?: Partial<Product> | null) => {
  const source = product?.brand

  if (Array.isArray(source)) {
    return source
      .map((brand) => normalizeBrandEntry(brand as BrandLike))
      .filter((brand): brand is NonNullable<ReturnType<typeof normalizeBrandEntry>> =>
        Boolean(brand),
      )
  }

  const singleBrand = normalizeBrandEntry(source as BrandLike)

  return singleBrand ? [singleBrand] : []
}

export const getProductType = (product?: Partial<Product> | null): null | ProductTypeValue => {
  const sku = product?.sku?.trim().toUpperCase() || ''

  if (sku.endsWith('OR')) {
    return 'original'
  }

  if (sku.endsWith('R') && !/[A-Z]R$/.test(sku)) {
    return 'removed-from-unit'
  }

  return 'compatible'
}
