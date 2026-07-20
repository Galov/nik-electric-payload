import crypto from 'crypto'
import type { Plugin } from 'payload'
import { ecommercePlugin, EUR } from '@payloadcms/plugin-ecommerce'
import { s3Storage } from '@payloadcms/storage-s3'

import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { exportOrderToMicroinvestHook } from '@/collections/Orders/hooks/exportOrderToMicroinvest'
import { sendOrderCreatedEmailsHook } from '@/collections/Orders/hooks/sendOrderCreatedEmails'
import { sendOrderCompletedEmailHook } from '@/collections/Orders/hooks/sendOrderCompletedEmail'
import { customerOnlyFieldAccess } from '@/access/customerOnlyFieldAccess'
import { isAdmin } from '@/access/isAdmin'
import { isDocumentOwner } from '@/access/isDocumentOwner'
import { ProductsCollection } from '@/collections/Products'
import { manualAdapter } from '@/ecommerce/manualAdapter'

const normalizeMoneyAdminFields = (fields: any[]): any[] => {
  return fields.map((field) => {
    const nextField = { ...field }

    if (Array.isArray(nextField.fields)) {
      nextField.fields = normalizeMoneyAdminFields(nextField.fields)
    }

    if (Array.isArray(nextField.tabs)) {
      nextField.tabs = nextField.tabs.map((tab: any) => ({
        ...tab,
        fields: Array.isArray(tab.fields) ? normalizeMoneyAdminFields(tab.fields) : tab.fields,
      }))
    }

    if (nextField.name === 'amount' || nextField.name === 'subtotal') {
      nextField.admin = {
        ...nextField.admin,
        components: {
          ...nextField.admin?.components,
          Field: {
            path: '@/components/admin/MoneyReadOnlyField',
            exportName: 'MoneyReadOnlyField',
          },
        },
        readOnly: true,
      }
    }

    return nextField
  })
}

const addHeldOrderStatusOption = (fields: any[]): any[] => {
  return fields.map((field) => {
    const nextField = { ...field }

    if (Array.isArray(nextField.fields)) {
      nextField.fields = addHeldOrderStatusOption(nextField.fields)
    }

    if (Array.isArray(nextField.tabs)) {
      nextField.tabs = nextField.tabs.map((tab: any) => ({
        ...tab,
        fields: Array.isArray(tab.fields) ? addHeldOrderStatusOption(tab.fields) : tab.fields,
      }))
    }

    if (nextField.name === 'status' && Array.isArray(nextField.options)) {
      const hasHeldStatus = nextField.options.some((option: any) =>
        typeof option === 'string' ? option === 'held' : option?.value === 'held',
      )

      if (!hasHeldStatus) {
        nextField.options = [
          ...nextField.options,
          {
            label: 'Задържана',
            value: 'held',
          },
        ]
      }

      nextField.admin = {
        ...nextField.admin,
        components: {
          ...nextField.admin?.components,
          Cell: '@/components/admin/OrderStatusCell#OrderStatusCell',
        },
      }
    }

    return nextField
  })
}

const addOrderItemSnapshotFields = (fields: any[]): any[] => {
  return fields.map((field) => {
    const nextField = { ...field }

    if (Array.isArray(nextField.fields)) {
      nextField.fields = addOrderItemSnapshotFields(nextField.fields)
    }

    if (Array.isArray(nextField.tabs)) {
      nextField.tabs = nextField.tabs.map((tab: any) => ({
        ...tab,
        fields: Array.isArray(tab.fields) ? addOrderItemSnapshotFields(tab.fields) : tab.fields,
      }))
    }

    if (nextField.name === 'items' && Array.isArray(nextField.fields)) {
      const hasProductMIIdField = nextField.fields.some(
        (itemField: any) => itemField?.name === 'productMIId',
      )
      const hasProductSKUField = nextField.fields.some(
        (itemField: any) => itemField?.name === 'productSKU',
      )
      const hasProductUnitPriceField = nextField.fields.some(
        (itemField: any) => itemField?.name === 'productUnitPrice',
      )

      const fieldsToInsert = []

      if (!hasProductMIIdField) {
        fieldsToInsert.push({
          name: 'productMIId',
          type: 'number',
          label: 'Microinvest ID',
          admin: {
            readOnly: true,
          },
        })
      }

      if (!hasProductSKUField) {
        fieldsToInsert.push({
          name: 'productSKU',
          type: 'text',
          label: 'Код',
          admin: {
            readOnly: true,
          },
        })
      }

      if (!hasProductUnitPriceField) {
        fieldsToInsert.push({
          name: 'productUnitPrice',
          type: 'number',
          label: 'Ед. цена',
          admin: {
            readOnly: true,
          },
        })
      }

      if (fieldsToInsert.length > 0) {
        const productFieldIndex = nextField.fields.findIndex(
          (itemField: any) => itemField?.name === 'product',
        )

        nextField.fields = [...nextField.fields]

        if (productFieldIndex >= 0) {
          nextField.fields.splice(productFieldIndex + 1, 0, ...fieldsToInsert)
        } else {
          nextField.fields.push(...fieldsToInsert)
        }
      }
    }

    return nextField
  })
}

const applyReadOnlyOrderItemsField = (fields: any[]): any[] => {
  return fields.map((field) => {
    const nextField = { ...field }

    if (Array.isArray(nextField.fields)) {
      nextField.fields = applyReadOnlyOrderItemsField(nextField.fields)
    }

    if (Array.isArray(nextField.tabs)) {
      nextField.tabs = nextField.tabs.map((tab: any) => ({
        ...tab,
        fields: Array.isArray(tab.fields) ? applyReadOnlyOrderItemsField(tab.fields) : tab.fields,
      }))
    }

    if (nextField.name === 'items') {
      nextField.admin = {
        ...nextField.admin,
        components: {
          ...nextField.admin?.components,
          Field: {
            path: '@/components/admin/OrderItemsReadOnlyField',
            exportName: 'OrderItemsReadOnlyField',
          },
        },
        readOnly: true,
      }
    }

    return nextField
  })
}

export const plugins: Plugin[] = [
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    customers: {
      slug: 'users',
    },
    currencies: {
      defaultCurrency: 'EUR',
      supportedCurrencies: [EUR],
    },
    payments: {
      paymentMethods: [manualAdapter()],
    },
    products: {
      productsCollectionOverride: ProductsCollection,
      variants: false,
    },
    carts: {
      cartsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        admin: {
          ...defaultCollection.admin,
          group: 'Търговия',
        },
        fields: normalizeMoneyAdminFields(defaultCollection.fields),
        labels: {
          plural: 'Колички',
          singular: 'Количка',
        },
      }),
    },
    orders: {
      ordersCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        endpoints: [
          ...(defaultCollection.endpoints || []),
          {
            path: '/:id/status',
            method: 'patch',
            handler: async (req) => {
              const user = req.user

              if (!user || !('roles' in user) || !user.roles?.includes('admin')) {
                return Response.json(
                  { message: 'Нямате право да променяте поръчки.' },
                  { status: 403 },
                )
              }

              const body = (await req.json?.()) as { status?: unknown } | undefined
              const allowedStatuses = ['processing', 'held', 'completed', 'cancelled', 'refunded']

              if (typeof body?.status !== 'string' || !allowedStatuses.includes(body.status)) {
                return Response.json({ message: 'Невалиден статус на поръчката.' }, { status: 400 })
              }

              const order = await req.payload.update({
                collection: 'orders',
                id: String(req.routeParams?.id || ''),
                data: {
                  status: body.status as
                    | 'processing'
                    | 'held'
                    | 'completed'
                    | 'cancelled'
                    | 'refunded',
                },
                context: {
                  skipMicroinvestOrderExport: true,
                },
                overrideAccess: true,
                req,
              })

              return Response.json({ id: order.id, status: order.status })
            },
          },
        ],
        enableQueryPresets: true,
        admin: {
          ...defaultCollection.admin,
          group: 'Търговия',
        },
        hooks: {
          ...defaultCollection.hooks,
          afterChange: [
            ...(defaultCollection.hooks?.afterChange || []),
            sendOrderCreatedEmailsHook,
            sendOrderCompletedEmailHook,
            exportOrderToMicroinvestHook,
          ],
        },
        fields: [
          ...applyReadOnlyOrderItemsField(
            addOrderItemSnapshotFields(
              addHeldOrderStatusOption(normalizeMoneyAdminFields(defaultCollection.fields)),
            ),
          ),
          {
            name: 'partnerCode',
            type: 'text',
            label: 'Код на партньор',
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
          },
          {
            name: 'miOrderExportStatus',
            type: 'select',
            label: 'Microinvest export',
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
            defaultValue: 'pending',
            options: [
              {
                label: 'Pending',
                value: 'pending',
              },
              {
                label: 'Sent',
                value: 'sent',
              },
              {
                label: 'Failed',
                value: 'failed',
              },
            ],
          },
          {
            name: 'miOrderExportFileName',
            type: 'text',
            label: 'Microinvest референция',
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
          },
          {
            name: 'miOrderExportLastAttemptAt',
            type: 'date',
            label: 'Последен опит за export',
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
          },
          {
            name: 'miOrderExportLastError',
            type: 'textarea',
            label: 'Microinvest export грешка',
            admin: {
              readOnly: true,
            },
          },
          {
            name: 'accessToken',
            type: 'text',
            unique: true,
            index: true,
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
            hooks: {
              beforeValidate: [
                ({ operation, value }) => {
                  if (operation === 'create' || !value) {
                    return crypto.randomUUID()
                  }

                  return value
                },
              ],
            },
          },
        ],
        labels: {
          plural: 'Поръчки',
          singular: 'Поръчка',
        },
      }),
    },
    transactions: {
      transactionsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        admin: {
          ...defaultCollection.admin,
          group: 'Търговия',
        },
        fields: normalizeMoneyAdminFields(defaultCollection.fields),
        labels: {
          plural: 'Транзакции',
          singular: 'Транзакция',
        },
      }),
    },
  }),
  ...(process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_ENDPOINT
    ? [
        s3Storage({
          collections: {
            media: true,
          },
          bucket: process.env.R2_BUCKET,
          config: {
            credentials: {
              accessKeyId: process.env.R2_ACCESS_KEY_ID,
              secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
            endpoint: process.env.R2_ENDPOINT,
            region: process.env.R2_REGION || 'auto',
          },
        }),
      ]
    : []),
]
