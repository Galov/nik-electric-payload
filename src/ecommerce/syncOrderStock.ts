import type { PayloadRequest } from 'payload'
import { syncCommittedOrderStockToIbis } from '@/collections/Products/hooks/syncProductToIbis'
import { claimDelivery, attemptWhere, type Recovery } from './deliveryState'

export async function syncOrderStock(id: string, req: PayloadRequest, recovery?: Recovery) {
  const claim = await claimDelivery(id, req, 'bg', recovery)
  if (!claim) return
  const productIDs = (claim.order.items || [])
    .map((item) => (typeof item.product === 'string' ? item.product : item.product?.id))
    .filter((id): id is string => Boolean(id))
  const results = await syncCommittedOrderStockToIbis(req.payload, productIDs)
  const failed =
    !results.length ||
    productIDs.length !== claim.order.items?.length ||
    results.some((item) => item.status !== 'sent')
  await req.payload.db.updateOne({
    collection: 'orders',
    where: attemptWhere(id, 'bg', claim.attemptId),
    data: {
      ibisStockSyncStatus: failed ? 'failed' : 'sent',
      ibisStockSyncError: failed ? 'IBIS_STOCK_SYNC_INCOMPLETE' : '',
      ibisStockSyncResults: results,
    },
  })
}
