const limit = Number(process.env.ORDER_LIMIT || '10')

const orders = db
  .getCollection('orders')
  .find(
    {},
    {
      createdAt: 1,
      customer: 1,
      miOrderExportFileName: 1,
      miOrderExportLastAttemptAt: 1,
      miOrderExportLastError: 1,
      miOrderExportStatus: 1,
      partnerCode: 1,
      updatedAt: 1,
    },
  )
  .sort({ createdAt: -1 })
  .limit(limit)
  .toArray()

printjson(
  orders.map((order) => ({
    createdAt: order.createdAt,
    id: order._id,
    miOrderExportFileName: order.miOrderExportFileName ?? null,
    miOrderExportLastAttemptAt: order.miOrderExportLastAttemptAt ?? null,
    miOrderExportLastError: order.miOrderExportLastError ?? null,
    miOrderExportStatus: order.miOrderExportStatus ?? null,
    partnerCode: order.partnerCode ?? null,
    updatedAt: order.updatedAt,
  })),
)
