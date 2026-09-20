import { createLocalReq, type PayloadRequest } from 'payload'
import { OrderAcceptanceError } from './ibis/contract'

export async function inOrderTransaction<T>(
  req: PayloadRequest,
  prepare: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  if (req.transactionID) throw new OrderAcceptanceError(503, 'TRANSACTION_ALREADY_ACTIVE')
  const transactionReq = await createLocalReq(
    {
      req: {
        headers: req.headers,
        user: req.user,
        query: { ...req.query },
        routeParams: { ...req.routeParams },
        data: req.data,
        locale: req.locale,
        fallbackLocale: req.fallbackLocale,
      },
      context: {
        ...req.context,
        skipIbisProductSync: true,
        skipMicroinvestOrderExport: true,
        skipOrderEmailNotifications: true,
        skipCategoryProductCountSync: true,
      },
    },
    req.payload,
  )
  const id = await req.payload.db.beginTransaction()
  if (!id || !req.payload.db.sessions?.[String(id)]?.inTransaction()) {
    if (id) await req.payload.db.rollbackTransaction(id)
    throw new OrderAcceptanceError(503, 'TRANSACTIONS_UNAVAILABLE')
  }
  transactionReq.transactionID = id
  try {
    const result = await prepare(transactionReq)
    await req.payload.db.commitTransaction(id)
    return result
  } catch (error) {
    await req.payload.db.rollbackTransaction(id).catch(() => undefined)
    throw error
  } finally {
    delete transactionReq.transactionID
  }
}
