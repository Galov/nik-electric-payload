import type { PayloadHandler } from 'payload'
import { acceptIbisOrder } from '@/ecommerce/ibis/acceptOrder'
import { authenticateIbis, OrderAcceptanceError, parseIbisOrder } from '@/ecommerce/ibis/contract'

export const ibisOrders: PayloadHandler = async (req) => {
  let accepted: { orderId: string; externalOrderId: string; replayed: boolean } | undefined
  try {
    const sender = authenticateIbis(req.headers.get('authorization'))
    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      throw new OrderAcceptanceError(400, 'INVALID_JSON')
    }
    const input = parseIbisOrder(body, sender)
    const result = await acceptIbisOrder(input, req)
    accepted = {
      orderId: result.orderID,
      externalOrderId: input.externalOrderId,
      replayed: Boolean(result.replayed),
    }
    const order = await req.payload.findByID({
      collection: 'orders',
      id: result.orderID,
      depth: 0,
      overrideAccess: true,
    })
    return Response.json(
      {
        ...accepted,
        acceptanceStatus: 'accepted',
        microinvestExport: { status: order.miOrderExportStatus || 'pending' },
        ibisStockSync: { status: order.ibisStockSyncStatus || 'pending' },
      },
      { status: result.replayed ? 200 : 201 },
    )
  } catch (error) {
    // A failure while fetching delivery status cannot turn acceptance into rejection.
    if (accepted)
      return Response.json(
        {
          ...accepted,
          acceptanceStatus: 'accepted',
          microinvestExport: { status: 'unavailable' },
          ibisStockSync: { status: 'unavailable' },
        },
        { status: accepted.replayed ? 200 : 201 },
      )
    if (error instanceof OrderAcceptanceError)
      return Response.json(
        {
          error: {
            code: error.code,
            details: error.details,
          },
        },
        { status: error.status },
      )
    req.payload.logger.error('Ibis order acceptance failed; retry with the same externalOrderId.')
    return Response.json(
      { error: { code: 'TEMPORARILY_UNAVAILABLE', details: [] } },
      { status: 503 },
    )
  }
}
