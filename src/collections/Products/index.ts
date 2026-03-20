import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'
import type { Access } from 'payload'
import { slugField } from 'payload'
import { checkRole } from '@/access/utilities'

const normalizeCatalogCompatibilityFields = ({
  data,
  originalDoc,
}: {
  data?: Record<string, unknown>
  originalDoc?: Record<string, unknown> | null
}) => {
  if (!data) {
    return data
  }

  const price =
    typeof data.price === 'number'
      ? data.price
      : typeof originalDoc?.price === 'number'
        ? originalDoc.price
        : 0

  const stockQty =
    typeof data.stockQty === 'number'
      ? data.stockQty
      : typeof originalDoc?.stockQty === 'number'
        ? originalDoc.stockQty
        : 0

  data.priceInUSD = price
  data.inventory = stockQty

  return data
}

const syncCatalogFields = ({ data, siblingData, value }: { data?: Record<string, unknown>; siblingData?: Record<string, unknown>; value?: number | null }) => {
  const price = value ?? siblingData?.price ?? data?.price
  return typeof price === 'number' ? price : 0
}

const syncInventoryFields = ({ data, siblingData, value }: { data?: Record<string, unknown>; siblingData?: Record<string, unknown>; value?: number | null }) => {
  const qty = value ?? siblingData?.stockQty ?? data?.stockQty
  return typeof qty === 'number' ? qty : 0
}

const adminOrCatalogPublished: Access = ({ req: { user } }) => {
  if (user && checkRole(['admin'], user)) {
    return true
  }

  return {
    published: {
      equals: true,
    },
  }
}

export const ProductsCollection: CollectionOverride = ({ defaultCollection }) => ({
  ...defaultCollection,
  access: {
    ...defaultCollection.access,
    read: adminOrCatalogPublished,
  },
  hooks: {
    ...defaultCollection.hooks,
    beforeChange: [
      ...(defaultCollection.hooks?.beforeChange || []),
      normalizeCatalogCompatibilityFields,
    ],
  },
  admin: {
    ...defaultCollection.admin,
    defaultColumns: ['title', 'sku', 'price', 'stockStatus', 'published'],
    group: 'Каталог',
    useAsTitle: 'title',
  },
  labels: {
    plural: 'Продукти',
    singular: 'Продукт',
  },
  defaultPopulate: {
    ...defaultCollection.defaultPopulate,
    title: true,
    slug: true,
    sku: true,
    price: true,
    priceInUSD: true,
    stockQty: true,
    stockStatus: true,
    inventory: true,
    images: true,
    categories: true,
    brand: true,
    published: true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Каталог',
          fields: [
            {
              name: 'description',
              type: 'textarea',
            },
            {
              name: 'shortDescription',
              type: 'textarea',
            },
            {
              name: 'images',
              type: 'array',
              fields: [
                {
                  name: 'legacyUrl',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'storageKey',
                  type: 'text',
                },
                {
                  name: 'alt',
                  type: 'text',
                },
              ],
            },
          ],
        },
        {
          label: 'Детайли',
          fields: [
            {
              name: 'sourceId',
              type: 'number',
              admin: {
                position: 'sidebar',
              },
              index: true,
              unique: true,
            },
            {
              name: 'sku',
              type: 'text',
              index: true,
            },
            {
              name: 'originalSku',
              type: 'text',
            },
            {
              name: 'manufacturerCode',
              type: 'text',
            },
            {
              name: 'brand',
              type: 'relationship',
              relationTo: 'brands',
            },
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
            },
            {
              name: 'price',
              type: 'number',
              defaultValue: 0,
              required: true,
            },
            {
              name: 'priceInUSD',
              type: 'number',
              admin: {
                description: 'Служебно поле за съвместимост с логиката на количката.',
                readOnly: true,
              },
              defaultValue: 0,
              hooks: {
                beforeChange: [syncCatalogFields],
              },
            },
            {
              name: 'stockQty',
              type: 'number',
              defaultValue: 0,
            },
            {
              name: 'inventory',
              type: 'number',
              admin: {
                description: 'Служебно поле за съвместимост с логиката за наличност.',
                readOnly: true,
              },
              defaultValue: 0,
              hooks: {
                beforeChange: [syncInventoryFields],
              },
            },
            {
              name: 'stockStatus',
              type: 'select',
              defaultValue: 'unknown',
              options: [
                {
                  label: 'В наличност',
                  value: 'instock',
                },
                {
                  label: 'Изчерпан',
                  value: 'outofstock',
                },
                {
                  label: 'По заявка',
                  value: 'onbackorder',
                },
                {
                  label: 'Неизвестно',
                  value: 'unknown',
                },
              ],
            },
            {
              name: 'manageStock',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'backordersAllowed',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'imagesMigrated',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'legacyAttachmentIDs',
              type: 'json',
            },
            {
              name: 'legacyProductUrl',
              type: 'text',
            },
            {
              name: 'legacyModifiedAt',
              type: 'date',
            },
            {
              name: 'published',
              type: 'checkbox',
              defaultValue: true,
            },
          ],
        },
      ],
    },
    slugField(),
  ],
})
