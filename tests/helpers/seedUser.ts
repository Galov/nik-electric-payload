import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  approved: true,
  companyAddress: 'бул. България 1',
  companyCity: 'София',
  companyEIK: '123456789',
  companyName: 'Payload Test Ltd.',
  email: 'dev@payloadcms.com',
  firstName: 'Dev',
  lastName: 'User',
  password: 'test',
  phone: '0888123456',
  roles: ['admin'] as ('admin' | 'customer')[],
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user
  await payload.create({
    collection: 'users',
    data: testUser,
    overrideAccess: true,
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
