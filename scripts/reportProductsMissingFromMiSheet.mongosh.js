const fs = require('fs')

const sheetPath = process.env.MI_SHEET_JSON_PATH

if (!sheetPath) {
  throw new Error('Missing MI_SHEET_JSON_PATH environment variable.')
}

const data = JSON.parse(fs.readFileSync(sheetPath, 'utf8'))
const sheetSkus = new Set(
  data.map((row) => (typeof row?.sku === 'string' ? row.sku.trim() : '')).filter(Boolean),
)

const products = db
  .getCollection('products')
  .find({}, { sku: 1, title: 1, slug: 1, miProductId: 1 })
  .toArray()

const withSku = products.filter((product) => typeof product.sku === 'string' && product.sku.trim())
const missingFromSheet = withSku.filter((product) => !sheetSkus.has(product.sku.trim()))

printjson({
  productsMissingFromSheet: missingFromSheet.length,
  productsWithSku: withSku.length,
  sampleMissing: missingFromSheet.slice(0, 30).map((product) => ({
    id: product._id,
    miProductId: product.miProductId ?? null,
    sku: product.sku,
    slug: product.slug ?? null,
    title: product.title,
  })),
  totalProducts: products.length,
  uniqueSheetSkus: sheetSkus.size,
})
