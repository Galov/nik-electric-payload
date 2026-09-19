import { addDataAndFileToRequest, type PayloadHandler, type Plugin } from 'payload'

import { manualAdapter } from './manualAdapter'

const confirmOrderPath = '/payments/manual/confirm-order'

const confirmManualOrder: PayloadHandler = async (req) => {
  await addDataAndFileToRequest(req)
  const data = req.data || {}
  const customerEmail = req.user?.email || data.customerEmail

  if (typeof customerEmail !== 'string' || !customerEmail) {
    return Response.json(
      { message: 'A customer email is required to make a purchase.' },
      { status: 400 },
    )
  }

  try {
    // The adapter updates stockQty through the Products hooks, which also set inventory.
    // Do not run ecommerce's confirmOrder handler: it decrements inventory again.
    const result = await manualAdapter().confirmOrder({
      data: { ...data, customerEmail },
      req,
    })

    return Response.json(result)
  } catch (error) {
    req.payload.logger.error({ err: error, msg: 'Error confirming manual order.' })
    return Response.json({ message: 'Error confirming order.' }, { status: 500 })
  }
}

/** Must run after ecommercePlugin so there is only one manual confirmation endpoint. */
export const manualCheckoutPlugin: Plugin = (config) => {
  const endpoints = config.endpoints || []
  const matches = endpoints.filter(
    (endpoint) => endpoint.path === confirmOrderPath && endpoint.method === 'post',
  )

  if (matches.length !== 1) {
    throw new Error('Expected exactly one ecommerce manual confirm-order endpoint.')
  }

  return {
    ...config,
    endpoints: endpoints.map((endpoint) =>
      endpoint === matches[0] ? { ...endpoint, handler: confirmManualOrder } : endpoint,
    ),
  }
}
