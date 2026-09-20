import {
  addDataAndFileToRequest,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type Plugin,
} from 'payload'
import { completeOrder } from './completeOrder'

export const initializeOrderDelivery: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create') {
    // Duplicating an order must not copy another order's delivery/reconciliation state.
    data.miOrderExportStatus = 'pending'
    if (req.context.adminOrderCreation) {
      delete data.ibisStockSyncStatus
      delete data.externalOrderId
    }
    for (const key of [
      'miOrderExportAttemptId',
      'miOrderExportFailurePhase',
      'miOrderExportLastAttemptAt',
      'miOrderExportLastError',
      'miOrderExportFileName',
      'miOrderExportNotificationStatus',
      'miOrderExportNotificationError',
      'ibisStockSyncAttemptId',
      'ibisStockSyncResults',
      'ibisStockSyncError',
      'ibisStockSyncAttemptAt',
    ])
      delete data[key]
  }
  return data
}
export const captureCreatedOrder: CollectionAfterChangeHook = ({ doc, operation, req }) => {
  if (operation === 'create') req.context.createdOrderID = doc.id
  return doc
}

// Decorate the sanitized default REST handlers, preserving Payload's parsing,
// access checks, validation, response shape, and duplicate-order behavior.
export const adminOrderCreationPlugin: Plugin = (config) => {
  const previous = config.onInit
  return {
    ...config,
    onInit: async (payload) => {
      await previous?.(payload)
      const collection = payload.collections.orders.config
      if (!collection.endpoints) throw new Error('Order endpoints are unavailable')
      for (const endpoint of collection.endpoints) {
        if (endpoint.method !== 'post' || !['/', '/:id/duplicate'].includes(endpoint.path)) continue
        const handler = endpoint.handler
        endpoint.handler = async (req) => {
          if (!req.user?.roles?.includes('admin'))
            return Response.json({ error: 'Forbidden' }, { status: 403 })
          await addDataAndFileToRequest(req)
          req.context.adminOrderCreation = true
          let response: Response | undefined
          await completeOrder(req, async (transactionReq) => {
            response = await handler(transactionReq)
            const orderID = transactionReq.context.createdOrderID
            if (!response.ok || typeof orderID !== 'string')
              throw new Error('Order creation did not complete')
            // Admin creation never reduces stock; preserve the existing administrative workflow.
            return { orderID, transactionID: '', productIDs: [] }
          })
          return response!
        }
      }
    },
  }
}
