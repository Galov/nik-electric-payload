import type { CollectionConfig } from 'payload'
import { adminOnly } from '@/access/adminOnly'
export const OrderDeliveryActions: CollectionConfig = {
  slug: 'order-delivery-actions',
  admin: { group: 'Търговия', defaultColumns: ['order', 'action', 'actor', 'createdAt'] },
  access: { read: adminOnly, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'order', type: 'relationship', relationTo: 'orders', required: true },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true },
    {
      name: 'action',
      type: 'select',
      options: ['send-mi', 'confirm-mi-accepted', 'authorize-mi-retry', 'retry-bg'],
      required: true,
    },
    { name: 'attemptId', type: 'text' },
    { name: 'reason', type: 'textarea', required: true },
    { name: 'previousStatus', type: 'text' },
  ],
}
