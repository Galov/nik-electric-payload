const orderId = process.env.ORDER_ID

if (!orderId) {
  throw new Error('Missing ORDER_ID environment variable.')
}

const order = db.getCollection('orders').findOne(
  { _id: ObjectId(orderId) },
  {
    createdAt: 1,
    customer: 1,
    items: 1,
    miOrderExportFileName: 1,
    miOrderExportLastAttemptAt: 1,
    miOrderExportLastError: 1,
    miOrderExportStatus: 1,
    partnerCode: 1,
    updatedAt: 1,
  },
)

printjson(order)
