import { setTimeout as delay } from 'node:timers/promises'
import type { PayloadRequest } from 'payload'
import { completeOrder, saveOrderAndStock, type AcceptedOrder } from '../completeOrder'
import { fingerprint, OrderAcceptanceError, type IbisOrderInput } from './contract'
import { roundCurrency } from '@/utilities/pricing'
import { toMinorUnits } from '@/utilities/money'

async function findAccepted(
  input: IbisOrderInput,
  req: PayloadRequest,
): Promise<AcceptedOrder | null> {
  const result = await req.payload.find({
    collection: 'ibis-order-keys',
    where: { externalOrderId: { equals: input.externalOrderId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const key = result.docs[0]
  if (!key) return null
  if (key.fingerprint !== fingerprint(input))
    throw new OrderAcceptanceError(409, 'IDEMPOTENCY_CONFLICT')
  const orderID = typeof key.order === 'object' ? key.order.id : key.order
  const order = await req.payload.findByID({
    collection: 'orders',
    id: orderID,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const transaction = order.transactions?.[0]
  return {
    orderID,
    transactionID: typeof transaction === 'object' ? transaction.id : String(transaction || ''),
    productIDs: [],
    replayed: true,
  }
}

export async function acceptIbisOrder(
  input: IbisOrderInput,
  req: PayloadRequest,
): Promise<AcceptedOrder> {
  // Check the actual MongoDB index, not just the Payload field declaration.
  const indexes = await req.payload.db.collections['ibis-order-keys'].collection.indexes()
  if (
    !indexes.some(
      (index) =>
        index.unique &&
        index.key.externalOrderId === 1 &&
        Object.keys(index.key).length === 1 &&
        !index.partialFilterExpression,
    )
  ) {
    throw new OrderAcceptanceError(503, 'IDEMPOTENCY_INDEX_UNAVAILABLE')
  }
  const existing = await findAccepted(input, req)
  if (existing) return existing
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await completeOrder(req, async (transactionReq) => {
        const replay = await findAccepted(input, transactionReq)
        if (replay) return replay
        const users = await req.payload.find({
          collection: 'users',
          where: { partnerCode: { equals: '412' } },
          limit: 2,
          depth: 0,
          overrideAccess: true,
          req: transactionReq,
        })
        if (users.docs.length !== 1)
          throw new OrderAcceptanceError(
            503,
            users.docs.length ? 'PARTNER_AMBIGUOUS' : 'PARTNER_NOT_FOUND',
          )
        const partner = users.docs[0]
        if (!partner.email) throw new OrderAcceptanceError(503, 'PARTNER_DATA_INCOMPLETE')
        const stock = new Map<string, { currentStockQty: number; quantity: number }>()
        const items: {
          product: string
          productSKU: string
          productMIId: number
          productUnitPrice: number
          quantity: number
        }[] = []
        const shortages: unknown[] = []
        for (const item of input.items) {
          const matches = await req.payload.find({
            collection: 'products',
            where: { sku: { equals: item.sku } },
            limit: 2,
            depth: 0,
            overrideAccess: true,
            req: transactionReq,
          })
          if (matches.docs.length !== 1)
            throw new OrderAcceptanceError(
              422,
              matches.docs.length ? 'SKU_AMBIGUOUS' : 'SKU_NOT_FOUND',
              [{ sku: item.sku }],
            )
          const product = matches.docs[0]
          if (
            typeof product.priceGroup1 !== 'number' ||
            !Number.isFinite(product.priceGroup1) ||
            product.priceGroup1 <= 0
          ) {
            throw new OrderAcceptanceError(422, 'INVALID_GROUP1_PRICE', [{ sku: item.sku }])
          }
          if (
            typeof product.miProductId !== 'number' ||
            !Number.isSafeInteger(product.miProductId) ||
            product.miProductId <= 0 ||
            typeof product.stockQty !== 'number' ||
            !Number.isFinite(product.stockQty)
          ) {
            throw new OrderAcceptanceError(422, 'PRODUCT_DATA_INCOMPLETE', [{ sku: item.sku }])
          }
          if (product.stockQty < item.quantity)
            shortages.push({ sku: item.sku, requested: item.quantity, available: product.stockQty })
          stock.set(product.id, { currentStockQty: product.stockQty, quantity: item.quantity })
          items.push({
            product: product.id,
            productSKU: item.sku,
            productMIId: product.miProductId,
            productUnitPrice: product.priceGroup1,
            quantity: item.quantity,
          })
        }
        if (shortages.length) throw new OrderAcceptanceError(409, 'INSUFFICIENT_STOCK', shortages)
        const amount = toMinorUnits(
          roundCurrency(
            items.reduce(
              (sum, item) => sum + roundCurrency(item.productUnitPrice * item.quantity),
              0,
            ),
          ),
        )
        if (!Number.isSafeInteger(amount) || amount < 0)
          throw new OrderAcceptanceError(422, 'INVALID_ORDER_TOTAL')
        const common = {
          amount,
          currency: 'EUR' as const,
          customer: partner.id,
          customerEmail: partner.email,
          items,
        }
        const accepted = await saveOrderAndStock(transactionReq, {
          transaction: { ...common, paymentMethod: 'manual', status: 'pending' },
          order: {
            ...common,
            partnerCode: '412',
            externalOrderId: input.externalOrderId,
            status: 'processing',
          },
          stock,
        })
        await req.payload.create({
          collection: 'ibis-order-keys',
          data: {
            externalOrderId: input.externalOrderId,
            fingerprint: fingerprint(input),
            order: accepted.orderID,
          },
          overrideAccess: true,
          req: transactionReq,
        })
        return accepted
      })
    } catch (error) {
      // Another request may have committed this key, or our commit acknowledgement was lost.
      const accepted = await findAccepted(input, req)
      if (accepted) return accepted
      if (error instanceof OrderAcceptanceError) throw error
      const mongo = error as { code?: number; hasErrorLabel?: (label: string) => boolean }
      if (
        attempt < 4 &&
        (mongo.code === 11000 ||
          mongo.code === 112 ||
          mongo.hasErrorLabel?.('TransientTransactionError'))
      ) {
        await delay(30 * 2 ** attempt)
        continue
      }
      throw new OrderAcceptanceError(503, 'TEMPORARILY_UNAVAILABLE')
    }
  }
  throw new OrderAcceptanceError(503, 'TEMPORARILY_UNAVAILABLE')
}
