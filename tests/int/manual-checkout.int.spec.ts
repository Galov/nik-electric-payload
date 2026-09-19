// @vitest-environment node
import type { Config, PayloadHandler, PayloadRequest, SanitizedCollectionConfig } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { manualCheckoutPlugin } from '@/ecommerce/manualCheckout'
import { plugins } from '@/plugins'

describe('manual checkout inventory ownership (mocked persistence)', () => {
  let config: Config
  let handler: PayloadHandler
  const baseConfig: Config = { db: {} as Config['db'], secret: 'unit-test-only' }

  beforeAll(async () => {
    // Build the actual ecommerce configuration without initializing Payload or a database.
    config = await plugins[0]({ ...baseConfig, collections: [] })
    expect(plugins[1]).toBe(manualCheckoutPlugin)
    config = await plugins[1](config)
    const endpoints = (config.endpoints || []).filter(
      (endpoint) =>
        endpoint.path === '/payments/manual/confirm-order' && endpoint.method === 'post',
    )
    expect(endpoints).toHaveLength(1)
    handler = endpoints[0].handler
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Network is disabled in this test')
      }),
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  function checkout({ stock = 10, quantities = [1], guest = false } = {}) {
    const product = {
      id: 'product-1',
      sku: '167MI07',
      miProductId: 123,
      stockQty: stock,
      inventory: stock,
      stockStatus: 'onbackorder',
      priceWholesale: 10,
    }
    const cart = {
      id: 'cart-1',
      currency: 'EUR',
      items: quantities.map((quantity) => ({ product, quantity })),
    }
    const documents: Record<string, Record<string, unknown>> = {}
    const payload = {
      logger: { error: vi.fn() },
      db: { updateOne: vi.fn() },
      findByID: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'carts') return structuredClone(cart)
        if (collection === 'transactions') return documents.transactions
        throw new Error(`Unexpected read: ${collection}`)
      }),
      create: vi.fn(
        async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
          const doc = { ...data, id: `${collection}-1` }
          documents[collection] = doc
          return doc
        },
      ),
      update: vi.fn(
        async (args: {
          collection: string
          data: Record<string, unknown>
          req: PayloadRequest
        }) => {
          if (args.collection === 'products') {
            let data = args.data
            const collection = config.collections!.find((entry) => entry.slug === 'products')!
            // Exercise the real compatibility hooks; all external side effects remain mocked.
            for (const hook of collection.hooks?.beforeChange || []) {
              data = await hook({
                data,
                originalDoc: { ...product },
              collection: collection as SanitizedCollectionConfig,
              context: args.req.context,
              operation: 'update',
                req: args.req,
              })
            }
            Object.assign(product, data)
            return product
          }
          if (args.collection === 'carts') Object.assign(cart, args.data)
          if (args.collection === 'transactions') Object.assign(documents.transactions, args.data)
          return args.data
        },
      ),
    }
    const request = (data: Record<string, unknown> = {}) =>
      Object.assign(
        new Request('http://localhost/api/payments/manual/confirm-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartID: cart.id, ...data }),
        }),
        { payload, user: guest ? null : { id: 'user-1', email: 'test@example.com' }, context: {} },
      ) as unknown as PayloadRequest
    return { product, payload, documents, request }
  }

  it.each([
    { stock: 10, quantities: [1], expected: 9 },
    { stock: 1, quantities: [1], expected: 0 },
    { stock: 10, quantities: [1, 2], expected: 7 },
  ])(
    'reduces both quantities once: $stock minus $quantities',
    async ({ stock, quantities, expected }) => {
      const { product, payload, documents, request } = checkout({ stock, quantities })
      const req = request()
      const response = await handler(req)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        orderID: 'orders-1',
        transactionID: 'transactions-1',
      })
      expect(product).toMatchObject({
        stockQty: expected,
        inventory: expected,
        stockStatus: 'onbackorder',
      })
      expect(
        payload.update.mock.calls.filter(([args]) => args.collection === 'products'),
      ).toHaveLength(1)
      expect(payload.db.updateOne).not.toHaveBeenCalled()
      expect(payload.findByID).toHaveBeenCalledWith(
        expect.objectContaining({ overrideAccess: false, req }),
      )
      expect(documents.transactions).toMatchObject({ order: 'orders-1', status: 'succeeded' })
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('passes guest cart access credentials through to the adapter', async () => {
    const { request, payload } = checkout({ guest: true })
    const req = request({ customerEmail: 'guest@example.com', secret: 'test-cart-secret' })
    expect((await handler(req)).status).toBe(200)
    expect(req.query?.secret).toBe('test-cart-secret')
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, req }),
    )
  })

  it('rejects a guest without email before writing anything', async () => {
    const { request, payload } = checkout({ guest: true })
    expect((await handler(request())).status).toBe(400)
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('does not write or reduce stock when cart access is denied', async () => {
    const { request, payload, product } = checkout()
    payload.findByID.mockRejectedValueOnce(new Error('Forbidden'))
    expect((await handler(request())).status).toBe(500)
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
    expect(product.stockQty).toBe(10)
  })

  it('does not reduce stock again when the completed cart is submitted again', async () => {
    const { request, payload, product } = checkout()
    expect((await handler(request())).status).toBe(200)
    expect((await handler(request())).status).toBe(500)
    expect(payload.create).toHaveBeenCalledTimes(2) // One transaction and one order.
    expect(product).toMatchObject({ stockQty: 9, inventory: 9 })
  })

  it('fails configuration if the plugin endpoint is missing or duplicated', () => {
    expect(() => manualCheckoutPlugin({ ...baseConfig, endpoints: [] })).toThrow('exactly one')
    const endpoint = { path: '/payments/manual/confirm-order', method: 'post' as const, handler }
    expect(() => manualCheckoutPlugin({ ...baseConfig, endpoints: [endpoint, endpoint] })).toThrow(
      'exactly one',
    )
  })
})
