import { createHash, timingSafeEqual } from 'node:crypto'

export class OrderAcceptanceError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: unknown[] = [],
  ) {
    super(code)
  }
}
export type IbisOrderInput = { externalOrderId: string; items: { sku: string; quantity: number }[] }
export type IbisSender = 'BG' | 'RO'

export function authenticateIbis(header: string | null): IbisSender {
  if (process.env.IBIS_ORDERS_ENABLED !== 'true') {
    throw new OrderAcceptanceError(503, 'INTEGRATION_DISABLED')
  }
  const bg = process.env.IBIS_ORDERS_BG_KEY
  const ro = process.env.IBIS_ORDERS_RO_KEY
  if ((bg && bg === ro) || (!bg && !ro))
    throw new OrderAcceptanceError(503, 'INTEGRATION_NOT_READY')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  for (const [sender, key] of [
    ['BG', bg],
    ['RO', ro],
  ] as const) {
    if (key && token && timingSafeEqual(digest(key), digest(token))) return sender
  }
  throw new OrderAcceptanceError(401, 'UNAUTHORIZED')
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value)

export function parseIbisOrder(value: unknown, sender: IbisSender): IbisOrderInput {
  if (!isObject(value) || !exactKeys(value, ['externalOrderId', 'items'])) {
    throw new OrderAcceptanceError(400, 'INVALID_REQUEST')
  }
  if (
    typeof value.externalOrderId !== 'string' ||
    !/^(BG|RO):[A-Za-z0-9][A-Za-z0-9._:-]{0,124}$/.test(value.externalOrderId) ||
    !value.externalOrderId.startsWith(`${sender}:`)
  ) {
    throw new OrderAcceptanceError(400, 'INVALID_EXTERNAL_ORDER_ID')
  }
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 500) {
    throw new OrderAcceptanceError(400, 'INVALID_ITEMS')
  }
  const seen = new Set<string>()
  const items = value.items.map((item, index) => {
    if (!isObject(item) || !exactKeys(item, ['sku', 'quantity']))
      throw new OrderAcceptanceError(400, 'INVALID_ITEM', [{ index }])
    if (
      typeof item.sku !== 'string' ||
      !item.sku.length ||
      item.sku.length > 128 ||
      item.sku.trim() !== item.sku ||
      /[\u0000-\u001f\u007f]/.test(item.sku)
    ) {
      throw new OrderAcceptanceError(422, 'INVALID_SKU', [{ index }])
    }
    if (seen.has(item.sku))
      throw new OrderAcceptanceError(422, 'DUPLICATE_ITEM_SKU', [{ sku: item.sku }])
    seen.add(item.sku)
    if (
      typeof item.quantity !== 'number' ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 1000000
    ) {
      throw new OrderAcceptanceError(422, 'INVALID_QUANTITY', [{ sku: item.sku }])
    }
    return { sku: item.sku, quantity: item.quantity }
  })
  items.sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
  return { externalOrderId: value.externalOrderId, items }
}
export const fingerprint = (input: IbisOrderInput) =>
  createHash('sha256').update(JSON.stringify(input.items)).digest('hex')
