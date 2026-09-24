// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Config, Endpoint, Payload, PayloadRequest } from 'payload'
import { adminOrderCreationPlugin } from '@/ecommerce/adminOrderCreation'

vi.mock('@/ecommerce/completeOrder', () => ({ completeOrder: vi.fn() }))

describe('admin order endpoint isolation', () => {
  it('restricts order creation without changing shared user and other collection handlers', async () => {
    const create = vi.fn(async () => Response.json({ doc: { id: 'new-user' } }, { status: 201 }))
    const duplicate = vi.fn(async () => Response.json({ doc: { id: 'copy' } }))
    const shared: Endpoint[] = [
      { path: '/', method: 'post', handler: create },
      { path: '/:id/duplicate', method: 'post', handler: duplicate },
      { path: '/', method: 'get', handler: create },
    ]
    const orders = { endpoints: [...shared] }
    const users = { endpoints: [...shared] }
    const media = { endpoints: [...shared] }
    const payload = {
      collections: {
        orders: { config: orders },
        users: { config: users },
        media: { config: media },
      },
    } as unknown as Payload
    const previous = vi.fn()
    const config = await adminOrderCreationPlugin({
      db: {} as Config['db'],
      secret: 'test',
      onInit: previous,
    })
    await config.onInit!(payload)
    expect(previous).toHaveBeenCalledWith(payload)

    const req = { user: null, context: {} } as PayloadRequest
    for (const index of [0, 1]) {
      expect(orders.endpoints[index]).not.toBe(shared[index])
      expect((await orders.endpoints[index].handler(req)).status).toBe(403)
      expect(users.endpoints[index]).toBe(shared[index])
      expect(media.endpoints[index]).toBe(shared[index])
    }
    expect(users.endpoints[0].handler).toBe(create)
    expect(users.endpoints[1].handler).toBe(duplicate)
    expect((await users.endpoints[0].handler(req)).status).toBe(201)
    expect(orders.endpoints[2]).toBe(shared[2])
  })
})
