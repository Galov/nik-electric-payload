import type { Field } from 'payload'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'

const access = {
  create: adminOnlyFieldAccess,
  update: adminOnlyFieldAccess,
  read: adminOnlyFieldAccess,
}
export const integrationOrderFields: Field[] = [
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
