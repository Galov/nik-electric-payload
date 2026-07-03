const order = db
  .getCollection('orders')
  .find(
    { miOrderExportStatus: 'failed' },
    {
      createdAt: 1,
      items: 1,
      miOrderExportFileName: 1,
      miOrderExportLastAttemptAt: 1,
      miOrderExportLastError: 1,
      miOrderExportStatus: 1,
      partnerCode: 1,
      updatedAt: 1,
    },
  )
  .sort({ createdAt: -1 })
  .limit(1)
  .toArray()[0]

printjson(order)
