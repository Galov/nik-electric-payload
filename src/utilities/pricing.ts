type PriceTier = 'general' | 'group1'

type PriceFields = {
  priceGroup1?: null | number
  priceWholesale?: null | number
}

type PricedProductLike = PriceFields | null | undefined

type CartItemLike = {
  product?: PricedProductLike | string
  quantity?: null | number
}

export const resolvePriceForTier = (
  priceTier: null | PriceTier | string | undefined,
  prices: PriceFields,
): number => {
  const wholesale =
    typeof prices.priceWholesale === 'number'
      ? prices.priceWholesale
      : 0

  if (priceTier === 'group1') {
    return typeof prices.priceGroup1 === 'number' && prices.priceGroup1 > 0
      ? prices.priceGroup1
      : wholesale
  }

  return wholesale
}

export const resolveLineTotalForTier = (
  priceTier: null | PriceTier | string | undefined,
  item: CartItemLike,
): number => {
  const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 0
  const product =
    item.product && typeof item.product === 'object' ? (item.product as PriceFields) : undefined

  if (!product || quantity === 0) {
    return 0
  }

  return resolvePriceForTier(priceTier, product) * quantity
}

export const resolveSubtotalForTier = (
  priceTier: null | PriceTier | string | undefined,
  items: CartItemLike[] | null | undefined,
): number => {
  if (!items?.length) {
    return 0
  }

  return items.reduce((subtotal, item) => subtotal + resolveLineTotalForTier(priceTier, item), 0)
}
