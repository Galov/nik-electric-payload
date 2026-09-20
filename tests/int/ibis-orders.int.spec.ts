import { OrderDeliveryActions } from '@/collections/OrderDeliveryActions'
import { orderDeliveryAction } from '@/endpoints/order-delivery-action'
import * as notifications from '@/utilities/email/notifications'
// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConfig, createLocalReq, getPayload, type Payload } from 'payload'
import { ibisOrders } from '@/endpoints/ibis-orders'
import { manualAdapter } from '@/ecommerce/manualAdapter'
import { exportOrderToMicroinvest } from '@/collections/Orders/hooks/exportOrderToMicroinvest'
import { parseIbisOrder } from '@/ecommerce/ibis/contract'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { plugins } from '@/plugins'
import { Users } from '@/collections/Users'
import { Brands } from '@/collections/Brands'
import { Categories } from '@/collections/Categories'
import { Media } from '@/collections/Media'
import { IbisOrderKeys } from '@/collections/IbisOrderKeys'
import type { User } from '@/payload-types'

// Opt-in, hard-coded loopback database. No application .env or production config is loaded.
const enabled = process.env.IBIS_TEST_DATABASE === 'local'
describe.skipIf(!enabled)('Ibis acceptance with real MongoDB transactions', () => {
  let payload: Payload
  let partner: User
  let fetchMock: ReturnType<typeof vi.fn>
  const context = {
    skipIbisProductSync: true,
    skipCategoryProductCountSync: true,
    skipOrderEmailNotifications: true,
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = 'mongodb://127.0.0.1:27028/nik_ibis_orders_test?replicaSet=rs0'
    process.env.PAYLOAD_SECRET = 'local-test-only-not-a-production-secret'
    process.env.EMAIL_ENABLED = 'false'
    process.env.IBIS_ORDERS_ENABLED = 'true'
    process.env.IBIS_ORDERS_BG_KEY = 'test-bg'
    process.env.IBIS_ORDERS_RO_KEY = 'test-ro'
    process.env.IBIS_SYNC_WEBHOOK_URL = 'https://ibis.invalid/sync'
    process.env.IBIS_SYNC_WEBHOOK_SECRET = 'test-only'
    process.env.MICROINVEST_ORDERS_WEBHOOK_URL = 'https://mi.invalid/orders'
    process.env.MICROINVEST_ORDERS_WEBHOOK_SECRET = 'test-only'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Network disabled')
      }),
    )
    const config = buildConfig({
      secret: process.env.PAYLOAD_SECRET,
      db: mongooseAdapter({ url: process.env.DATABASE_URL }),
      collections: [Users, Brands, Categories, Media, IbisOrderKeys, OrderDeliveryActions],
      plugins,
      editor: lexicalEditor(),
    })
    payload = await getPayload({ config })
    await Promise.all(Object.values(payload.db.collections).map((model) => model.init()))
  }, 60000)

  afterAll(async () => {
    await payload?.destroy()
    vi.unstubAllGlobals()
  })
  afterEach(() => vi.restoreAllMocks())
  beforeEach(async () => {
    // Deletes only collections of the hard-coded local fixture database above.
    for (const model of Object.values(payload.db.collections)) await model.deleteMany({})
    for (const model of Object.values(payload.db.versions)) await model.deleteMany({})
    fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      expect(Object.values(payload.db.sessions).some((session) => session.inTransaction())).toBe(
        false,
      )
      expect(await payload.count({ collection: 'orders' })).toMatchObject({ totalDocs: 1 })
      return successResponse(options)
    })
    vi.stubGlobal('fetch', fetchMock)
    partner = await payload.create({
      collection: 'users',
      context,
      user: { roles: ['admin'] },
      data: {
        email: 'ibis@example.test',
        password: 'local-test-password',
        companyCity: 'Test',
        phone: '000',
        companyAddress: 'Test',
        firstName: 'Test',
        lastName: 'Partner',
        partnerCode: '412',
        priceTier: 'general',
        registrationStatus: 'approved',
      },
    })
  })

  function successResponse(options: RequestInit) {
    const body = JSON.parse(String(options.body))
    return Response.json({
      event: body.event,
      items: body.items.map((item: { sku?: string; sourceId?: number }) => ({
        sku: item.sku,
        sourceId: item.sourceId ?? null,
        status: 'updated',
      })),
    })
  }
  async function action(id: string, action: string, extra: Record<string, unknown> = {}) {
    const order = await payload.findByID({ collection: 'orders', id, depth: 0 })
    const req = await createLocalReq(
      { user: { ...partner, roles: ['admin'], collection: 'users' }, req: { routeParams: { id } } },
      payload,
    )
    req.json = async () => ({
      action,
      reason: 'Checked in MI by administrator',
      expectedAttemptId:
        (action === 'retry-bg' ? order.ibisStockSyncAttemptId : order.miOrderExportAttemptId) ||
        null,
      ...extra,
    })
    return orderDeliveryAction(req)
  }
  async function product(sku = '167MI07', stock = 10, price = 4, id = 123) {
    return payload.create({
      collection: 'products',
      context,
      data: {
        title: `Product ${sku}`,
        slug: sku.toLowerCase(),
        sku,
        miProductId: id,
        priceRetail: 8,
        priceWholesale: 6,
        priceGroup1: price,
        price: 0,
        stockQty: stock,
        stockStatus: 'onbackorder',
        published: true,
        _status: 'published',
      },
    })
  }
  async function request(
    items = [{ sku: '167MI07', quantity: 1 }],
    externalOrderId = 'BG:123',
    key = 'test-bg',
  ) {
    const req = await createLocalReq({}, payload)
    req.headers = new Headers({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    })
    req.json = async () => ({ externalOrderId, items })
    return ibisOrders(req)
  }
  async function noWrites() {
    expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'transactions' })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'ibis-order-keys' })).totalDocs).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  }
  async function stock(id: string, qty: number) {
    expect(await payload.findByID({ collection: 'products', id, depth: 0 })).toMatchObject({
      stockQty: qty,
      inventory: qty,
      stockStatus: 'onbackorder',
    })
  }

  it('accepts at group1 price, retains stockStatus, and dispatches only after commit', async () => {
    const p = await product()
    const response = await request()
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      acceptanceStatus: 'accepted',
      replayed: false,
      microinvestExport: { status: 'sent' },
      ibisStockSync: { status: 'sent' },
    })
    await stock(p.id, 9)
    const order = await payload.findByID({ collection: 'orders', id: body.orderId, depth: 0 })
    expect(order).toMatchObject({
      amount: 400,
      partnerCode: '412',
      customer: partner.id,
      items: [{ productUnitPrice: 4 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const mi = JSON.parse(
      fetchMock.mock.calls.find(([url]) => String(url).includes('mi.invalid'))![1].body,
    )
    expect(mi).toMatchObject({ PartnerCode: 412, items: [{ GoodID: 123, Price: 4, Qtty: 1 }] })
  })

  it.each([0, -1])('rejects invalid group1 price %s without wholesale fallback', async (price) => {
    const p = await product('167MI07', 10, price)
    expect(await (await request()).json()).toMatchObject({
      error: { code: 'INVALID_GROUP1_PRICE' },
    })
    await noWrites()
    await stock(p.id, 10)
  })

  it('rejects a multi-item shortage atomically and permits corrected retry of the ID', async () => {
    const a = await product()
    const b = await product('SECOND', 0, 3, 124)
    const response = await request([
      { sku: '167MI07', quantity: 2 },
      { sku: 'SECOND', quantity: 1 },
    ])
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: {
        code: 'INSUFFICIENT_STOCK',
        details: [{ sku: 'SECOND', requested: 1, available: 0 }],
      },
    })
    await noWrites()
    await stock(a.id, 10)
    await stock(b.id, 0)
    expect((await request()).status).toBe(201)
  })

  it('returns the same order for sequential and reordered repeats; rejects changed content', async () => {
    await product()
    await product('SECOND', 10, 3, 124)
    const items = [
      { sku: '167MI07', quantity: 1 },
      { sku: 'SECOND', quantity: 2 },
    ]
    const first = await (await request(items)).json()
    const repeat = await request([...items].reverse())
    expect(repeat.status).toBe(200)
    expect(await repeat.json()).toMatchObject({ orderId: first.orderId, replayed: true })
    expect((await request()).status).toBe(409)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(1)
  })

  it('deduplicates concurrent submissions with the database unique key', async () => {
    const p = await product()
    // Other requests may still hold read transactions while the winner sends; verify
    // committed order visibility instead of asserting that all sessions have ended.
    fetchMock.mockImplementation(async () => {
      expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(1)
      return new Response('{}', { status: 200 })
    })
    const responses = await Promise.all([request(), request(), request()])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201])
    const bodies = await Promise.all(responses.map((r) => r.json()))
    expect(new Set(bodies.map((b) => b.orderId)).size).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await stock(p.id, 9)
  })

  it('uses the unique key to reject concurrent conflicting orders with disjoint products', async () => {
    const a = await product()
    const b = await product('SECOND', 10, 4, 124)
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
    const responses = await Promise.all([request(), request([{ sku: 'SECOND', quantity: 1 }])])
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    const conflict = responses.find((response) => response.status === 409)!
    expect(await conflict.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } })
    expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'transactions' })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'ibis-order-keys' })).totalDocs).toBe(1)
    const remaining = await Promise.all(
      [a, b].map((p) => payload.findByID({ collection: 'products', id: p.id })),
    )
    expect(remaining.map((p) => p.stockQty).sort()).toEqual([10, 9])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rolls back a failure on the second product, including order, transaction and first stock update', async () => {
    const a = await product()
    const b = await product('SECOND', 10, 3, 124)
    const original = payload.update.bind(payload)
    vi.spyOn(payload, 'update').mockImplementation((async (
      args: Parameters<typeof payload.update>[0],
    ) => {
      if (args.collection === 'products' && 'id' in args && args.id === b.id)
        throw new Error('Injected failure')
      return original(args)
    }) as typeof payload.update)
    expect(
      (
        await request([
          { sku: '167MI07', quantity: 1 },
          { sku: 'SECOND', quantity: 1 },
        ])
      ).status,
    ).toBe(503)
    await noWrites()
    await stock(a.id, 10)
    await stock(b.id, 10)
  })

  it('keeps acceptance after a Microinvest timeout; neither replay nor order update exports again', async () => {
    const p = await product()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('mi.invalid')) throw new Error('timeout with private upstream data')
      return new Response('{}', { status: 200 })
    })
    const response = await request()
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.microinvestExport.status).toBe('unknown')
    expect((await request()).status).toBe(200)
    const req = await createLocalReq({}, payload)
    await exportOrderToMicroinvest(body.orderId, req)
    await payload.update({ collection: 'orders', id: body.orderId, data: { note: 'Review' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await stock(p.id, 9)
    expect(
      (await payload.findByID({ collection: 'orders', id: body.orderId })).miOrderExportLastError,
    ).toBe('MICROINVEST_RESULT_UNCONFIRMED')
  })

  it('records failed BG sync for zero retail price while accepting valid group1 order', async () => {
    const p = await product()
    await payload.update({ collection: 'products', id: p.id, context, data: { priceRetail: 0 } })
    const body = await (await request()).json()
    expect(body).toMatchObject({
      acceptanceStatus: 'accepted',
      ibisStockSync: { status: 'failed' },
      microinvestExport: { status: 'sent' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the same partner for RO and rejects a mismatched key prefix', async () => {
    await product()
    expect((await request(undefined, 'RO:123', 'test-bg')).status).toBe(400)
    expect((await request(undefined, 'RO:123', 'test-ro')).status).toBe(201)
  })

  it('fails closed when the unique partner is missing or ambiguous', async () => {
    await product()
    await payload.db.collections.users.updateOne(
      { _id: partner.id },
      { $unset: { partnerCode: '' } },
    )
    expect(await (await request()).json()).toMatchObject({ error: { code: 'PARTNER_NOT_FOUND' } })
    await noWrites()
  })

  it('preserves manual checkout pricing and decrements only once in a real transaction', async () => {
    const p = await product()
    const cart = await payload.create({
      collection: 'carts',
      data: { customer: partner.id, currency: 'EUR', items: [{ product: p.id, quantity: 1 }] },
    })
    const req = await createLocalReq({ user: { ...partner, collection: 'users' } }, payload)
    const result = await manualAdapter().confirmOrder({ req, data: { cartID: cart.id } })
    const order = await payload.findByID({ collection: 'orders', id: result.orderID })
    expect(order.amount).toBe(600) // General customer's wholesale price remains unchanged.
    await stock(p.id, 9)
  })

  it('rejects missing group1 price instead of falling back', async () => {
    const p = await product()
    await payload.db.collections.products.updateOne({ _id: p.id }, { $unset: { priceGroup1: '' } })
    expect(await (await request()).json()).toMatchObject({
      error: { code: 'INVALID_GROUP1_PRICE' },
    })
    await noWrites()
  })

  it('rejects missing and ambiguous SKUs', async () => {
    expect(await (await request()).json()).toMatchObject({ error: { code: 'SKU_NOT_FOUND' } })
    await product()
    const other = await product('OTHER', 10, 4, 124)
    await payload.db.collections.products.updateOne({ _id: other.id }, { $set: { sku: '167MI07' } })
    expect(await (await request()).json()).toMatchObject({ error: { code: 'SKU_AMBIGUOUS' } })
    await noWrites()
  })

  it('rejects missing Microinvest ID before accepting', async () => {
    const p = await product()
    await payload.db.collections.products.updateOne({ _id: p.id }, { $unset: { miProductId: '' } })
    expect(await (await request()).json()).toMatchObject({
      error: { code: 'PRODUCT_DATA_INCOMPLETE' },
    })
    await noWrites()
  })

  it('rejects ambiguous partner 412 without changing user profiles', async () => {
    await product()
    await payload.create({
      collection: 'users',
      context,
      user: { roles: ['admin'] },
      data: {
        email: 'duplicate@example.test',
        password: 'local-password',
        companyCity: 'Test',
        phone: '000',
        companyAddress: 'Test',
        firstName: 'Other',
        lastName: 'Partner',
        partnerCode: '412',
      },
    })
    expect(await (await request()).json()).toMatchObject({ error: { code: 'PARTNER_AMBIGUOUS' } })
    await noWrites()
  })

  it('fails closed without real transactions or the unique index', async () => {
    await product()
    const begin = vi.spyOn(payload.db, 'beginTransaction').mockResolvedValue(null)
    expect(await (await request()).json()).toMatchObject({
      error: { code: 'TRANSACTIONS_UNAVAILABLE' },
    })
    begin.mockRestore()
    vi.spyOn(payload.db.collections['ibis-order-keys'].collection, 'indexes').mockResolvedValue([])
    expect(await (await request()).json()).toMatchObject({
      error: { code: 'IDEMPOTENCY_INDEX_UNAVAILABLE' },
    })
    await noWrites()
  })

  it('allows historical orders without externalOrderId', async () => {
    await payload.create({ collection: 'orders', context, data: { status: 'processing' } })
    await payload.create({ collection: 'orders', context, data: { status: 'processing' } })
    expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'ibis-order-keys' })).totalDocs).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated calls and stays disabled unless explicitly enabled', async () => {
    expect((await request(undefined, 'BG:1', 'wrong')).status).toBe(401)
    process.env.IBIS_ORDERS_ENABLED = 'false'
    try {
      expect((await request()).status).toBe(503)
    } finally {
      process.env.IBIS_ORDERS_ENABLED = 'true'
    }
    await noWrites()
  })

  it('exports administrative REST creation after commit and notifies once on failure', async () => {
    const p = await product()
    const observedTransactions: boolean[] = []
    const observedCounts: number[] = []
    const notify = vi
      .spyOn(notifications, 'sendMicroinvestExportFailedEmail')
      .mockImplementation(async () => {
        observedTransactions.push(
          Object.values(payload.db.sessions).some((session) => session.inTransaction()),
        )
      })
    fetchMock.mockImplementation(async () => {
      observedTransactions.push(
        Object.values(payload.db.sessions).some((session) => session.inTransaction()),
      )
      observedCounts.push((await payload.count({ collection: 'orders' })).totalDocs)
      expect(Object.values(payload.db.sessions).some((session) => session.inTransaction())).toBe(
        false,
      )
      expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(1)
      throw new Error('timeout')
    })
    const req = await createLocalReq(
      {
        user: { ...partner, roles: ['admin'], collection: 'users' },
        req: {
          routeParams: { collection: 'orders' },
          data: {
            customer: partner.id,
            partnerCode: '412',
            status: 'processing',
            items: [{ product: p.id, productMIId: 123, productUnitPrice: 4, quantity: 1 }],
          },
        },
      },
      payload,
    )
    const endpoint =
      payload.collections.orders.config.endpoints &&
      payload.collections.orders.config.endpoints.find((e) => e.path === '/' && e.method === 'post')
    if (!endpoint) throw new Error('Missing admin create handler')
    const response = await endpoint.handler(req)
    expect(response.status).toBe(201)
    const { doc } = await response.json()
    expect((await payload.findByID({ collection: 'orders', id: doc.id })).miOrderExportStatus).toBe(
      'unknown',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)
    await payload.update({ collection: 'orders', id: doc.id, data: { note: 'Ordinary edit' } })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(observedTransactions.every((active) => !active)).toBe(true)
    expect(observedCounts).toEqual([1])
    await stock(p.id, 10)
  })

  it('rolls back administrative creation without HTTP or notifications when commit fails', async () => {
    const notify = vi
      .spyOn(notifications, 'sendMicroinvestExportFailedEmail')
      .mockResolvedValue(undefined)
    vi.spyOn(payload.db, 'commitTransaction').mockRejectedValueOnce(
      new Error('Injected commit failure'),
    )
    const req = await createLocalReq(
      {
        user: { ...partner, roles: ['admin'], collection: 'users' },
        req: {
          routeParams: { collection: 'orders' },
          data: { status: 'processing' },
        },
      },
      payload,
    )
    const endpoint =
      payload.collections.orders.config.endpoints &&
      payload.collections.orders.config.endpoints.find((e) => e.path === '/' && e.method === 'post')
    if (!endpoint) throw new Error('Missing admin handler')
    await expect(endpoint.handler(req)).rejects.toThrow('Injected commit failure')
    await noWrites()
    expect(notify).not.toHaveBeenCalled()
  })

  it('protects recovery authorization and service-owned fields from generic updates', async () => {
    await product()
    const { orderId } = await (await request()).json()
    const req = await createLocalReq({ req: { routeParams: { id: orderId } } }, payload)
    req.json = async () => ({ action: 'send-mi', reason: 'Unauthorized', expectedAttemptId: null })
    expect((await orderDeliveryAction(req)).status).toBe(403)
    await payload.update({
      collection: 'orders',
      id: orderId,
      overrideAccess: false,
      user: { ...partner, roles: ['admin'] },
      data: { miOrderExportStatus: 'pending', note: 'Allowed edit' },
    })
    expect(
      (await payload.findByID({ collection: 'orders', id: orderId })).miOrderExportStatus,
    ).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('recovers a pending order and records a failed administrative email without repeating it on edits', async () => {
    const p = await product()
    const order = await payload.create({
      collection: 'orders',
      context,
      data: {
        status: 'processing',
        items: [{ product: p.id, productMIId: 123, productUnitPrice: 4, quantity: 1 }],
      },
    })
    const notify = vi
      .spyOn(notifications, 'sendMicroinvestExportFailedEmail')
      .mockRejectedValue(new Error('Mail failure'))
    expect((await action(order.id, 'send-mi')).status).toBe(200)
    expect(await payload.findByID({ collection: 'orders', id: order.id })).toMatchObject({
      miOrderExportStatus: 'failed',
      miOrderExportFailurePhase: 'before-send',
      miOrderExportNotificationStatus: 'failed',
    })
    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { note: 'Review email failure' },
    })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    await stock(p.id, 10)
  })

  it('recovers pre-HTTP failure once with audit, without another order or stock deduction', async () => {
    const p = await product()
    const notify = vi
      .spyOn(notifications, 'sendMicroinvestExportFailedEmail')
      .mockResolvedValue(undefined)
    delete process.env.MICROINVEST_ORDERS_WEBHOOK_SECRET
    let body
    try {
      body = await (await request()).json()
    } finally {
      process.env.MICROINVEST_ORDERS_WEBHOOK_SECRET = 'test-only'
    }
    const order = await payload.findByID({ collection: 'orders', id: body.orderId })
    expect(order).toMatchObject({
      miOrderExportStatus: 'failed',
      miOrderExportFailurePhase: 'before-send',
    })
    expect(notify).toHaveBeenCalledTimes(1)
    const results = await Promise.all([action(order.id, 'send-mi'), action(order.id, 'send-mi')])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('mi.invalid'))).toHaveLength(1)
    const audits = await payload.find({ collection: 'order-delivery-actions', depth: 0 })
    expect(audits.docs).toHaveLength(1)
    expect(audits.docs[0]).toMatchObject({ actor: partner.id, order: order.id, action: 'send-mi' })
    expect(audits.docs[0].createdAt).toBeTruthy()
    await stock(p.id, 9)
    expect((await payload.count({ collection: 'orders' })).totalDocs).toBe(1)
  })

  it('blocks blind unknown retries and requires recorded reconciliation before authorizing resend', async () => {
    const p = await product()
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes('mi.invalid')) throw new Error('timeout')
      return successResponse(options)
    })
    const { orderId } = await (await request()).json()
    const original = await payload.findByID({ collection: 'orders', id: orderId })
    expect((await action(orderId, 'send-mi')).status).toBe(409)
    expect((await action(orderId, 'authorize-mi-retry')).status).toBe(409)
    expect((await action(orderId, 'authorize-mi-retry', { reconciled: true })).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      (await action(orderId, 'send-mi', { expectedAttemptId: original.miOrderExportAttemptId }))
        .status,
    ).toBe(409)
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) =>
      successResponse(options),
    )
    expect((await action(orderId, 'send-mi')).status).toBe(200)
    expect((await payload.find({ collection: 'order-delivery-actions' })).totalDocs).toBe(2)
    await stock(p.id, 9)
  })

  it('reconciles interrupted sending as accepted and rejects active sending', async () => {
    await product()
    const { orderId } = await (await request()).json()
    await payload.db.updateOne({
      collection: 'orders',
      id: orderId,
      data: {
        miOrderExportStatus: 'sending',
        miOrderExportLastAttemptAt: new Date().toISOString(),
      },
    })
    expect((await action(orderId, 'send-mi')).status).toBe(409)
    expect((await action(orderId, 'confirm-mi-accepted', { reconciled: true })).status).toBe(409)
    await payload.db.updateOne({
      collection: 'orders',
      id: orderId,
      data: { miOrderExportLastAttemptAt: new Date(Date.now() - 120000).toISOString() },
    })
    expect((await action(orderId, 'confirm-mi-accepted', { reconciled: true })).status).toBe(200)
    expect(
      (await payload.findByID({ collection: 'orders', id: orderId })).miOrderExportStatus,
    ).toBe('sent')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends valid products despite one invalid retail price and retries current absolute stock including zero', async () => {
    const a = await product()
    const b = await product('SECOND', 10, 4, 124)
    await payload.update({ collection: 'products', id: a.id, context, data: { priceRetail: 0 } })
    const { orderId } = await (
      await request([
        { sku: '167MI07', quantity: 1 },
        { sku: 'SECOND', quantity: 1 },
      ])
    ).json()
    expect(await payload.findByID({ collection: 'orders', id: orderId })).toMatchObject({
      ibisStockSyncStatus: 'failed',
      ibisStockSyncResults: [
        { productId: a.id, status: 'failed' },
        { productId: b.id, status: 'sent' },
      ],
    })
    await payload.update({
      collection: 'products',
      id: a.id,
      context,
      data: { priceRetail: 8, stockQty: 0, inventory: 0 },
    })
    expect((await action(orderId, 'retry-bg')).status).toBe(200)
    const sent = JSON.parse(
      fetchMock.mock.calls.filter(([url]) => url.includes('ibis.invalid')).at(-1)![1].body,
    )
    expect(sent.items.find((item: { sku: string }) => item.sku === '167MI07').data.stockQty).toBe(0)
    expect(
      (await payload.findByID({ collection: 'orders', id: orderId })).ibisStockSyncStatus,
    ).toBe('sent')
    await stock(a.id, 0)
    await stock(b.id, 9)
  })

  it.each(['not_found', 'invalid', 'missing', 'malformed', 'duplicate'])(
    'does not accept BG HTTP 200 with %s item results',
    async (failure) => {
      await product()
      fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
        if (url.includes('mi.invalid')) return Response.json({})
        if (failure === 'malformed') return new Response('not JSON', { status: 200 })
        const item = JSON.parse(String(options.body)).items[0]
        const entry = {
          sku: item.sku,
          sourceId: item.sourceId,
          status: failure === 'duplicate' ? 'updated' : failure,
        }
        return Response.json({
          event: 'product.price_stock_updated',
          items: failure === 'missing' ? [] : failure === 'duplicate' ? [entry, entry] : [entry],
        })
      })
      const { orderId } = await (await request()).json()
      expect(await payload.findByID({ collection: 'orders', id: orderId })).toMatchObject({
        ibisStockSyncStatus: 'failed',
        ibisStockSyncResults: [{ status: 'failed' }],
      })
    },
  )

  it('rejects unknown fields, duplicate SKUs and fractional quantities', () => {
    expect(() =>
      parseIbisOrder(
        { externalOrderId: 'BG:1', items: [{ sku: 'X', quantity: 1 }], price: 2 },
        'BG',
      ),
    ).toThrow('INVALID_REQUEST')
    expect(() =>
      parseIbisOrder({ externalOrderId: 'BG:1', items: [{ sku: 'X', quantity: 1.2 }] }, 'BG'),
    ).toThrow('INVALID_QUANTITY')
    expect(() =>
      parseIbisOrder(
        {
          externalOrderId: 'BG:1',
          items: [
            { sku: 'X', quantity: 1 },
            { sku: 'X', quantity: 2 },
          ],
        },
        'BG',
      ),
    ).toThrow('DUPLICATE_ITEM_SKU')
  })
})
