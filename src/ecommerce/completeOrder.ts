import { createLocalReq, type PayloadRequest, type RequiredDataFromCollectionSlug } from 'payload'
import { exportOrderToMicroinvest } from '@/collections/Orders/hooks/exportOrderToMicroinvest'
import { syncOrderStock } from './syncOrderStock'
import { syncCategoryProductCount } from '@/collections/Categories/hooks/syncCategoryProductCount'
import { sendOrderCreatedEmails } from '@/utilities/email/notifications'
import { inOrderTransaction } from './orderTransaction'

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
    await syncOrderStock(result.orderID, req)
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
  const result = await inOrderTransaction(req, prepare)
  if (!result.replayed) {
    try {
      await dispatchAcceptedOrder(result, req)
    } catch {
      req.payload.logger.error('Committed order has pending external operations requiring review.')
    }
  }
  return result
}
