import type { CollectionBeforeDeleteHook } from 'payload'

import { APIError } from 'payload'

export const preventDeletingCategoryWithProducts: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const products = new Map<string, string>()

  for (const draft of [false, true]) {
    const { docs } = await req.payload.find({
      collection: 'products',
      depth: 0,
      draft,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req: { ...req },
      select: { sku: true },
      where: { categories: { equals: id } },
    })

    for (const product of docs) {
      products.set(product.id, product.sku || products.get(product.id) || product.id)
    }
  }

  if (products.size === 0) return

  const references = [...products.values()].sort((a, b) => a.localeCompare(b, 'bg'))

  throw new APIError(
    `Категорията се използва от следните продукти: ${references.join(', ')}. Премахнете категорията от тях или ги преместете в друга категория, преди да я изтриете.`,
    409,
    undefined,
    true,
  )
}
