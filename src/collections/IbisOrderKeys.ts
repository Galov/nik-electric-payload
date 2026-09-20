import type { CollectionConfig } from 'payload'
import { adminOnly } from '@/access/adminOnly'

// Separate unique-key records leave historical orders with no external ID unaffected.
export const IbisOrderKeys: CollectionConfig = {
  slug: 'ibis-order-keys',
  admin: { hidden: true },
  access: { create: () => false, update: () => false, delete: () => false, read: adminOnly },
  fields: [
    { name: 'externalOrderId', type: 'text', required: true, unique: true, index: true },
    { name: 'fingerprint', type: 'text', required: true },
    { name: 'order', type: 'relationship', relationTo: 'orders', required: true },
  ],
}
