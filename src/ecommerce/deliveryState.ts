import { randomUUID } from 'node:crypto'
import type { PayloadRequest, Where } from 'payload'
import type { Order } from '@/payload-types'
import { inOrderTransaction } from './orderTransaction'
import { OrderAcceptanceError } from './ibis/contract'

export type Recovery = {
  action: 'send-mi' | 'retry-bg' | 'confirm-mi-accepted' | 'authorize-mi-retry'
  expectedAttemptId: string | null
  reason: string
  reconciled?: boolean
}
export const interrupted = (date?: string | null) =>
  Boolean(date && Date.now() - Date.parse(date) > 60000)
export const attemptWhere = (id: string, channel: 'mi' | 'bg', attempt: string): Where => ({
  and: [
    { id: { equals: id } },
    {
      [channel === 'mi' ? 'miOrderExportAttemptId' : 'ibisStockSyncAttemptId']: { equals: attempt },
    },
    { [channel === 'mi' ? 'miOrderExportStatus' : 'ibisStockSyncStatus']: { equals: 'sending' } },
  ],
})

// Claim and audit commit together, before any external operation. MongoDB write
// conflicts and attempt tokens protect against concurrent/stale administrator actions.
export async function claimDelivery(
  id: string,
  req: PayloadRequest,
  channel: 'mi' | 'bg',
  recovery?: Recovery,
) {
  return inOrderTransaction(req, async (tx) => {
    const order = await tx.payload.findByID({
      collection: 'orders',
      id,
      depth: 0,
      req: tx,
      overrideAccess: true,
    })
    const status = channel === 'mi' ? order.miOrderExportStatus : order.ibisStockSyncStatus
    const previousAttempt =
      (channel === 'mi' ? order.miOrderExportAttemptId : order.ibisStockSyncAttemptId) || null
    if (recovery) {
      if (!req.user?.roles?.includes('admin')) throw new OrderAcceptanceError(403, 'FORBIDDEN')
      if (previousAttempt !== recovery.expectedAttemptId)
        throw new OrderAcceptanceError(409, 'ACTION_CONFLICT')
    }
    const reconcile =
      recovery && ['confirm-mi-accepted', 'authorize-mi-retry'].includes(recovery.action)
    if (reconcile) {
      if (
        !recovery.reconciled ||
        !(
          status === 'unknown' ||
          (status === 'sending' && interrupted(order.miOrderExportLastAttemptAt)) ||
          (status === 'failed' && order.miOrderExportFailurePhase !== 'before-send')
        )
      ) {
        throw new OrderAcceptanceError(409, 'RECONCILIATION_REQUIRED')
      }
    } else {
      const allowed =
        status === 'pending' ||
        (recovery &&
          status === 'failed' &&
          (channel === 'bg' || order.miOrderExportFailurePhase === 'before-send')) ||
        (recovery &&
          channel === 'bg' &&
          status === 'sending' &&
          interrupted(order.ibisStockSyncAttemptAt))
      if (!allowed) {
        if (recovery) throw new OrderAcceptanceError(409, 'RECONCILIATION_REQUIRED')
        return null
      }
    }
    const attemptId = randomUUID()
    const nextStatus = reconcile
      ? recovery.action === 'confirm-mi-accepted'
        ? 'sent'
        : 'pending'
      : 'sending'
    const data =
      channel === 'mi'
        ? {
            miOrderExportStatus: nextStatus,
            miOrderExportAttemptId: attemptId,
            miOrderExportLastAttemptAt: new Date().toISOString(),
            miOrderExportLastError: '',
            miOrderExportFailurePhase: null,
            miOrderExportNotificationStatus: null,
            miOrderExportNotificationError: '',
          }
        : {
            ibisStockSyncStatus: nextStatus,
            ibisStockSyncAttemptId: attemptId,
            ibisStockSyncAttemptAt: new Date().toISOString(),
            ibisStockSyncError: '',
          }
    // This read/write occurs in a real transaction; a concurrent writer causes a
    // write conflict, never a second successful claim.
    const updated = (await tx.payload.db.updateOne({
      collection: 'orders',
      id,
      data,
      req: tx,
    })) as unknown as Order
    if (recovery)
      await tx.payload.create({
        collection: 'order-delivery-actions',
        overrideAccess: true,
        req: tx,
        data: {
          order: id,
          actor: req.user!.id,
          action: recovery.action,
          attemptId,
          reason: recovery.reason,
          previousStatus: status || 'unset',
        },
      })
    return { order: updated, attemptId, reconcile: Boolean(reconcile) }
  })
}
