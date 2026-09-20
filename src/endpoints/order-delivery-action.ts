import type { PayloadHandler } from 'payload'
import { exportOrderToMicroinvest } from '@/collections/Orders/hooks/exportOrderToMicroinvest'
import { syncOrderStock } from '@/ecommerce/syncOrderStock'
import { type Recovery } from '@/ecommerce/deliveryState'
import { OrderAcceptanceError } from '@/ecommerce/ibis/contract'

export const orderDeliveryAction: PayloadHandler = async (req) => {
  if (!req.user?.roles?.includes('admin'))
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 })
  try {
    const body = (await req.json?.()) as Recovery
    if (
      !body ||
      !['send-mi', 'retry-bg', 'confirm-mi-accepted', 'authorize-mi-retry'].includes(body.action) ||
      !(body.expectedAttemptId === null || typeof body.expectedAttemptId === 'string') ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      body.reason.length > 2000 ||
      (body.reconciled !== undefined && typeof body.reconciled !== 'boolean')
    )
      throw new OrderAcceptanceError(400, 'INVALID_ACTION')
    const id = req.routeParams?.id
    if (typeof id !== 'string') throw new OrderAcceptanceError(400, 'INVALID_ORDER')
    if (body.action === 'retry-bg') await syncOrderStock(id, req, body)
    else await exportOrderToMicroinvest(id, req, body)
    const order = await req.payload.findByID({
      collection: 'orders',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return Response.json({
      action: body.action,
      orderId: id,
      microinvestExportStatus: order.miOrderExportStatus,
      ibisStockSyncStatus: order.ibisStockSyncStatus,
    })
  } catch (error) {
    if (error instanceof OrderAcceptanceError)
      return Response.json({ error: error.code }, { status: error.status })
    // Includes transaction write conflicts; never repeat a disputed action automatically.
    req.payload.logger.error('Order delivery action failed; refresh the order before proceeding.')
    return Response.json({ error: 'ACTION_FAILED_REFRESH_ORDER' }, { status: 409 })
  }
}
