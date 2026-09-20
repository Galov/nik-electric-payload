import type { Field } from 'payload'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'

const access = {
  create: adminOnlyFieldAccess,
  update: () => false,
  read: adminOnlyFieldAccess,
}
export const integrationOrderFields: Field[] = [
  {
    name: 'deliveryActions',
    type: 'ui',
    admin: {
      components: { Field: '@/components/admin/OrderDeliveryActions#OrderDeliveryActions' },
    },
  },
  { name: 'miOrderExportAttemptId', type: 'text', access, admin: { readOnly: true } },
  {
    name: 'miOrderExportFailurePhase',
    type: 'select',
    options: ['before-send', 'after-send'],
    access,
    admin: { readOnly: true },
  },
  {
    name: 'miOrderExportNotificationStatus',
    type: 'select',
    options: ['pending', 'sent', 'failed'],
    access,
    admin: { readOnly: true },
  },
  { name: 'miOrderExportNotificationError', type: 'text', access, admin: { readOnly: true } },
  { name: 'ibisStockSyncAttemptId', type: 'text', access, admin: { readOnly: true } },
  { name: 'ibisStockSyncResults', type: 'json', access, admin: { readOnly: true } },
  { name: 'externalOrderId', type: 'text', index: true, access, admin: { readOnly: true } },
  {
    name: 'ibisStockSyncStatus',
    type: 'select',
    access,
    admin: { readOnly: true, position: 'sidebar' },
    options: ['pending', 'sending', 'sent', 'failed'],
  },
  { name: 'ibisStockSyncError', type: 'text', access, admin: { readOnly: true } },
  { name: 'ibisStockSyncAttemptAt', type: 'date', access, admin: { readOnly: true } },
]
