import { createLocalReq, type PayloadRequest, type RequiredDataFromCollectionSlug } from 'payload'
import { exportOrderToMicroinvest } from '@/collections/Orders/hooks/exportOrderToMicroinvest'
import { syncCommittedOrderStockToIbis } from '@/collections/Products/hooks/syncProductToIbis'
import { syncCategoryProductCount } from '@/collections/Categories/hooks/syncCategoryProductCount'
import { sendOrderCreatedEmails } from '@/utilities/email/notifications'
import { OrderAcceptanceError } from './ibis/contract'

export type AcceptedOrder = {
  orderID: string
  transactionID: string
  productIDs: string[]
  replayed?: boolean
}
type TransactionData = RequiredDataFromCollectionSlug<'transactions'>
type OrderData = RequiredDataFromCollectionSlug<'orders'>

export async function saveOrderAndStock(
  req: PayloadRequest,
  args: {
    transaction: TransactionData
    order: OrderData
    stock: Map<string, { currentStockQty: number | null; quantity: number }>
    cartID?: string
  },
): Promise<AcceptedOrder> {
  const transaction = await req.payload.create({
    collection: 'transactions',
    data: args.transaction,
    overrideAccess: true,
    req,
  })
  const order = await req.payload.create({
    collection: 'orders',
    data: {
      ...args.order,
      transactions: [transaction.id],
      miOrderExportStatus: 'pending',
      ibisStockSyncStatus: 'pending',
    },
    overrideAccess: true,
    req,
  })
  await req.payload.update({
    collection: 'transactions',
    id: transaction.id,
    data: { order: order.id, status: 'succeeded' },
    overrideAccess: true,
    req,
  })
  const productIDs: string[] = []
  for (const [id, ordered] of args.stock) {
    if (ordered.currentStockQty === null) continue // Preserve checkout's existing missing-stock behavior.
    const quantity = Math.max(0, ordered.currentStockQty - ordered.quantity)
    await req.payload.update({
      collection: 'products',
      id,
      data: { stockQty: quantity, inventory: quantity },
      overrideAccess: true,
      req,
    })
    productIDs.push(id)
  }
  if (args.cartID)
    await req.payload.update({
      collection: 'carts',
      id: args.cartID,
      data: { items: [], purchasedAt: new Date().toISOString() },
      overrideAccess: true,
      req,
    })
  return { orderID: order.id, transactionID: transaction.id, productIDs }
}

export async function dispatchAcceptedOrder(result: AcceptedOrder, originalReq: PayloadRequest) {
  const req = await createLocalReq(
    { context: { skipMicroinvestOrderExport: true, skipOrderEmailNotifications: true } },
    originalReq.payload,
  )
  // Each channel remains recoverable independently. Never turn a committed order into an HTTP error.
  try {
    const claimed = await req.payload.db.updateOne({
      collection: 'orders',
      where: {
        and: [{ id: { equals: result.orderID } }, { ibisStockSyncStatus: { equals: 'pending' } }],
      },
      data: { ibisStockSyncStatus: 'sending', ibisStockSyncAttemptAt: new Date().toISOString() },
    })
    if (claimed) {
      let error = ''
      try {
        await syncCommittedOrderStockToIbis(req.payload, result.productIDs)
      } catch {
        error = 'IBIS_STOCK_SYNC_FAILED'
      }
      await req.payload.update({
        collection: 'orders',
        id: result.orderID,
        req,
        overrideAccess: true,
        data: { ibisStockSyncStatus: error ? 'failed' : 'sent', ibisStockSyncError: error },
      })
    }
  } catch {
    req.payload.logger.error('Committed order stock dispatch requires review.')
  }
  try {
    await exportOrderToMicroinvest(result.orderID, req)
  } catch {
    req.payload.logger.error('Committed order Microinvest dispatch requires reconciliation.')
  }
  try {
    const order = await req.payload.findByID({
      collection: 'orders',
      id: result.orderID,
      overrideAccess: true,
      depth: 0,
    })
    await sendOrderCreatedEmails({ order, payload: req.payload })
  } catch {
    req.payload.logger.error('Committed order email notification failed.')
  }
  try {
    await syncCategoryProductCount(req.payload)
  } catch {
    req.payload.logger.error('Category counts require refresh after order acceptance.')
  }
}

// Every nested Local API operation receives this request and its MongoDB session.
export async function completeOrder(
  req: PayloadRequest,
  prepare: (transactionReq: PayloadRequest) => Promise<AcceptedOrder>,
): Promise<AcceptedOrder> {
  if (req.transactionID) throw new OrderAcceptanceError(503, 'TRANSACTION_ALREADY_ACTIVE')
  // A fresh Payload request gives relationship loading its own DataLoader bound to
  // this transaction, rather than reusing a loader closed over the HTTP request.
  const transactionReq = await createLocalReq(
    {
      req: {
        headers: req.headers,
        user: req.user,
        query: { ...req.query },
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
  let result: AcceptedOrder
  try {
    result = await prepare(transactionReq)
    await req.payload.db.commitTransaction(id)
  } catch (error) {
    await req.payload.db.rollbackTransaction(id).catch(() => undefined)
    throw error
  } finally {
    delete transactionReq.transactionID
  }
  if (!result.replayed) {
    try {
      await dispatchAcceptedOrder(result, req)
    } catch {
      req.payload.logger.error('Committed order has pending external operations requiring review.')
    }
  }
  return result
}
