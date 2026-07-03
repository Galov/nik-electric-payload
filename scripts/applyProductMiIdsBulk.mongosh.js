const fs = require('fs')

const reportPath = process.env.MI_SYNC_REPORT_PATH

if (!reportPath) {
  throw new Error('Missing MI_SYNC_REPORT_PATH environment variable.')
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const updatedRows = Array.isArray(report.updatedRows) ? report.updatedRows : []

const ops = updatedRows.map((row) => ({
  updateOne: {
    filter: { _id: ObjectId(String(row.productId)) },
    update: {
      $set: {
        miProductId: row.nextMiProductId,
      },
    },
  },
}))

if (!ops.length) {
  printjson({
    matched: 0,
    modified: 0,
    reportPath,
    requested: 0,
  })
  quit(0)
}

const result = db.getCollection('products').bulkWrite(ops, { ordered: false })

printjson({
  matched: result.matchedCount,
  modified: result.modifiedCount,
  reportPath,
  requested: ops.length,
})
