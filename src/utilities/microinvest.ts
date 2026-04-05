export type ProductTypeValue = 'compatible' | 'original' | 'removed-from-unit'

const PRODUCT_TYPE_SUFFIXES: Array<{ productType: ProductTypeValue; suffix: string }> = [
  { productType: 'original', suffix: 'OR' },
  { productType: 'removed-from-unit', suffix: 'R' },
]

export const parseMicroinvestDescription = (value?: null | string) => {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') || ''

  if (!normalized) {
    return null
  }

  for (const { productType, suffix } of PRODUCT_TYPE_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      const originalSku = normalized.slice(0, -suffix.length)

      return {
        isRefurbished: productType === 'removed-from-unit',
        originalSku,
        productType,
      }
    }
  }

  return {
    isRefurbished: false,
    originalSku: normalized,
    productType: 'compatible' as const,
  }
}
