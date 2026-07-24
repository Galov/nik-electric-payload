import type { CollectionOverride } from '@payloadcms/plugin-ecommerce/types'
import type { Access } from 'payload'
import { slugField } from 'payload'
import { checkRole } from '@/access/utilities'
import {
  syncCategoryProductCountAfterProductChange,
  syncCategoryProductCountAfterProductDelete,
} from '@/collections/Categories/hooks/syncCategoryProductCount'
import {
  syncDeletedProductToIbisHook,
  syncProductToIbisHook,
} from '@/collections/Products/hooks/syncProductToIbis'

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
    typeof data.priceWholesale === 'number'
      ? data.priceWholesale
      : typeof originalDoc?.priceWholesale === 'number'
        ? originalDoc.priceWholesale
        : 0

  const stockQty =
    typeof data.stockQty === 'number'
      ? data.stockQty
      : typeof originalDoc?.stockQty === 'number'
        ? originalDoc.stockQty
        : 0

  data.priceInUSD = price
  data.priceInEUR = price
  data.priceInUSDEnabled = price > 0
  data.priceInEUREnabled = price > 0
  data.inventory = stockQty

  const images = Array.isArray(data.images)
    ? data.images
    : Array.isArray(originalDoc?.images)
      ? originalDoc.images
      : []

  data.hasImages = images.some((image) => {
    if (!image || typeof image !== 'object') return false

    const row = image as {
      legacyUrl?: unknown
      media?: unknown
      storageKey?: unknown
    }

    return Boolean(
      row.media ||
      (typeof row.storageKey === 'string' && row.storageKey.trim()) ||
      (typeof row.legacyUrl === 'string' && row.legacyUrl.trim()),
    )
  })

  return data
}

const ensureCatalogCompatibilityFields = ({ doc }: { doc?: Record<string, unknown> | null }) => {
  if (!doc) {
    return doc
  }

  const wholesalePrice = typeof doc.priceWholesale === 'number' ? doc.priceWholesale : 0
  const stockQty = typeof doc.stockQty === 'number' ? doc.stockQty : 0

  if (typeof doc.priceInEUR !== 'number') {
    doc.priceInEUR = wholesalePrice
  }

  if (typeof doc.priceInUSD !== 'number') {
    doc.priceInUSD = wholesalePrice
  }

  if (typeof doc.priceInEUREnabled !== 'boolean') {
    doc.priceInEUREnabled = wholesalePrice > 0
  }

  if (typeof doc.priceInUSDEnabled !== 'boolean') {
    doc.priceInUSDEnabled = wholesalePrice > 0
  }

  if (typeof doc.inventory !== 'number') {
    doc.inventory = stockQty
  }

  return doc
}

const syncCatalogFields = ({
  data,
  siblingData,
  value,
}: {
  data?: Record<string, unknown>
  siblingData?: Record<string, unknown>
  value?: number | null
}) => {
  const price = value ?? siblingData?.priceWholesale ?? data?.priceWholesale
  return typeof price === 'number' ? price : 0
}

const syncInventoryFields = ({
  data,
  siblingData,
  value,
}: {
  data?: Record<string, unknown>
  siblingData?: Record<string, unknown>
  value?: number | null
}) => {
  const qty = value ?? siblingData?.stockQty ?? data?.stockQty
  return typeof qty === 'number' ? qty : 0
}

const getProductVersionsConfig = (
  versions:
    | (CollectionOverride extends (args: any) => infer R
        ? R extends { versions?: infer V }
          ? V
          : never
        : never)
    | undefined,
) => {
  const baseVersions = versions && typeof versions === 'object' ? versions : {}
  const baseDrafts =
    versions &&
    typeof versions === 'object' &&
    'drafts' in versions &&
    versions.drafts &&
    typeof versions.drafts === 'object'
      ? versions.drafts
      : {}

  return {
    ...baseVersions,
    maxPerDoc: 3,
    drafts: {
      ...baseDrafts,
      autosave: false,
    },
  }
}

const buildProductSlugField = () => {
  const field = slugField({
    position: undefined,
  })

  if (field.type !== 'row') {
    return field
  }

  return {
    ...field,
    fields: field.fields.map((nestedField) => {
      if ('name' in nestedField && nestedField.name === 'slug') {
        return {
          ...nestedField,
          label:
            'Адрес на продукта (частта след nikelectric.com/product/; ако е празно, се генерира автоматично от името)',
        }
      }

      return nestedField
    }),
  }
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
  enableQueryPresets: true,
  access: {
    ...defaultCollection.access,
    read: adminOrCatalogPublished,
  },
  versions: getProductVersionsConfig(defaultCollection.versions),
  hooks: {
    ...defaultCollection.hooks,
    afterChange: [
      ...(defaultCollection.hooks?.afterChange || []),
      syncProductToIbisHook,
      syncCategoryProductCountAfterProductChange,
    ],
    afterDelete: [
      ...(defaultCollection.hooks?.afterDelete || []),
      syncDeletedProductToIbisHook,
      syncCategoryProductCountAfterProductDelete,
    ],
    afterRead: [...(defaultCollection.hooks?.afterRead || []), ensureCatalogCompatibilityFields],
    beforeChange: [
      ...(defaultCollection.hooks?.beforeChange || []),
      normalizeCatalogCompatibilityFields,
    ],
  },
  admin: {
    ...defaultCollection.admin,
    components: {
      ...defaultCollection.admin?.components,
      edit: {
        ...defaultCollection.admin?.components?.edit,
        Status: {
          path: '@/components/admin/HiddenProductDraftStatus',
          exportName: 'HiddenProductDraftStatus',
        },
      },
    },
    defaultColumns: ['images', 'title', 'sku', 'brand', 'priceWholesale', 'stockQty', 'published'],
    group: 'Каталог',
    listSearchableFields: ['sku', 'miProductId'],
    useAsTitle: 'title',
  },
  labels: {
    plural: 'Продукти',
    singular: 'Продукт',
  },
  defaultPopulate: {
    ...defaultCollection.defaultPopulate,
    title: true,
    isNewProduct: true,
    isOnPromotion: true,
    slug: true,
    sku: true,
    description: true,
    priceRetail: true,
    priceWholesale: true,
    priceGroup1: true,
    priceInEUR: true,
    priceInEUREnabled: true,
    priceInUSD: true,
    priceInUSDEnabled: true,
    stockQty: true,
    stockStatus: true,
    inventory: true,
    images: true,
    categories: true,
    brand: true,
    miProductId: true,
    originalSku: true,
    published: true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Ръчно съдържание',
          fields: [
            { name: 'title', label: 'Име', type: 'text', required: true },
            {
              name: 'isOnPromotion',
              label: 'Продукт в промоция',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'isNewProduct',
              label: 'Нов продукт',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'description',
              label: 'Описание',
              admin: {
                description: 'Основното описание, което се вижда на продуктовата страница.',
              },
              maxLength: 100000,
              type: 'textarea',
            },
            {
              name: 'brand',
              label: 'Съвместим с марки',
              type: 'relationship',
              relationTo: 'brands',
              hasMany: true,
            },
            {
              name: 'categories',
              label: 'Категории',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              admin: {
                sortOptions: 'adminSort',
              },
            },
            buildProductSlugField(),
            {
              name: 'images',
              label: 'Снимки',
              type: 'array',
              admin: {
                components: {
                  Cell: {
                    path: '@/components/admin/ProductThumbnailCell',
                    exportName: 'ProductThumbnailCell',
                  },
                },
              },
              labels: {
                plural: 'Снимки',
                singular: 'Снимка',
              },
              fields: [
                {
                  name: 'preview',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: {
                        path: '@/components/admin/ProductImagePreviewField',
                        exportName: 'ProductImagePreviewField',
                      },
                    },
                  },
                },
                {
                  name: 'media',
                  label: 'Качен файл',
                  type: 'upload',
                  relationTo: 'media',
                },
                {
                  name: 'legacyUrl',
                  label: 'Външен URL',
                  type: 'text',
                  admin: {
                    description:
                      'Използвайте го само ако снимката е от външен адрес или от стар импорт. За нормална работа качвайте файл от полето по-горе.',
                  },
                },
                {
                  name: 'storageKey',
                  label: 'Ключ в хранилището',
                  type: 'text',
                  admin: {
                    hidden: true,
                  },
                },
                {
                  name: 'alt',
                  label: 'Alt текст',
                  type: 'text',
                },
              ],
            },
          ],
        },
        {
          label: 'Автоматични Microinvest данни',
          fields: [
            {
              name: 'published',
              label: 'Публикуван',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                components: {
                  Cell: '@/components/admin/PublishedStatusCell#PublishedStatusCell',
                },
              },
            },
            {
              name: 'sourceId',
              label: 'Изходен ID',
              type: 'number',
              admin: {
                hidden: true,
              },
              index: true,
              unique: true,
            },
            {
              name: 'miProductId',
              label: 'Microinvest ID',
              type: 'number',
              admin: {
                readOnly: true,
              },
              index: true,
              unique: true,
            },
            {
              name: 'sku',
              label: 'Код (SKU)',
              type: 'text',
              index: true,
            },
            {
              name: 'originalSku',
              label: 'Оригинален код',
              type: 'text',
            },
            {
              name: 'manufacturerCode',
              label: 'Производител',
              type: 'text',
            },
            {
              name: 'productType',
              label: 'Тип на продукта',
              type: 'select',
              admin: {
                hidden: true,
              },
              options: [
                {
                  label: 'Съвместим',
                  value: 'compatible',
                },
                {
                  label: 'Оригинал',
                  value: 'original',
                },
                {
                  label: 'От нов уред',
                  value: 'removed-from-unit',
                },
              ],
            },
            {
              name: 'isRefurbished',
              label: 'Refurbished продукт',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'priceRetail',
              label: 'Цена на дребно',
              type: 'number',
              defaultValue: 0,
              required: true,
            },
            {
              name: 'priceWholesale',
              label: 'Цена на едро',
              type: 'number',
              defaultValue: 0,
              required: true,
            },
            {
              name: 'priceGroup1',
              label: 'Цена за ценова група 1',
              type: 'number',
              defaultValue: 0,
              required: true,
            },
            {
              name: 'price',
              label: 'Служебна цена',
              type: 'number',
              defaultValue: 0,
              required: true,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'priceInEUR',
              label: 'Служебна цена EUR',
              type: 'number',
              admin: {
                hidden: true,
              },
              defaultValue: 0,
              hooks: {
                beforeChange: [syncCatalogFields],
              },
            },
            {
              name: 'priceInEUREnabled',
              label: 'Служебна цена EUR е активна',
              type: 'checkbox',
              admin: {
                hidden: true,
              },
              defaultValue: false,
              hooks: {
                beforeChange: [
                  ({
                    data,
                    siblingData,
                    value,
                  }: {
                    data?: Record<string, unknown>
                    siblingData?: Record<string, unknown>
                    value?: boolean | null
                  }) => {
                    const price =
                      siblingData?.priceInEUR ??
                      data?.priceInEUR ??
                      siblingData?.priceWholesale ??
                      data?.priceWholesale

                    return typeof price === 'number' ? price > 0 : Boolean(value)
                  },
                ],
              },
            },
            {
              name: 'priceInUSD',
              label: 'Служебна цена',
              type: 'number',
              admin: {
                hidden: true,
              },
              defaultValue: 0,
              hooks: {
                beforeChange: [syncCatalogFields],
              },
            },
            {
              name: 'priceInUSDEnabled',
              label: 'Служебна цена USD е активна',
              type: 'checkbox',
              admin: {
                hidden: true,
              },
              defaultValue: false,
              hooks: {
                beforeChange: [
                  ({
                    data,
                    siblingData,
                    value,
                  }: {
                    data?: Record<string, unknown>
                    siblingData?: Record<string, unknown>
                    value?: boolean | null
                  }) => {
                    const price =
                      siblingData?.priceInUSD ??
                      data?.priceInUSD ??
                      siblingData?.priceWholesale ??
                      data?.priceWholesale

                    return typeof price === 'number' ? price > 0 : Boolean(value)
                  },
                ],
              },
            },
            {
              name: 'stockQty',
              label: 'Наличност (бр.)',
              type: 'number',
              defaultValue: 0,
            },
            {
              name: 'inventory',
              label: 'Служебна наличност',
              type: 'number',
              admin: {
                hidden: true,
              },
              defaultValue: 0,
              hooks: {
                beforeChange: [syncInventoryFields],
              },
            },
            {
              name: 'stockStatus',
              label: 'Статус наличност',
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
              label: 'Управление на наличност',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'backordersAllowed',
              label: 'Позволени заявки без наличност',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'imagesMigrated',
              label: 'Снимките са мигрирани',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'legacyAttachmentIDs',
              label: 'Служебни attachment ID',
              type: 'json',
              admin: {
                hidden: true,
              },
            },
            {
              name: 'legacyProductUrl',
              label: 'Изходен URL на продукта',
              type: 'text',
              admin: {
                hidden: true,
              },
            },
            {
              name: 'legacyModifiedAt',
              label: 'Последна промяна в изходния сайт',
              type: 'date',
              admin: {
                hidden: true,
              },
            },
          ],
        },
      ],
    },
    {
      name: 'hasImages',
      type: 'checkbox',
      label: 'Има снимка',
      defaultValue: false,
      index: true,
      admin: {
        description: 'Служебно поле за надеждно филтриране на продуктите по наличие на снимка.',
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
})
