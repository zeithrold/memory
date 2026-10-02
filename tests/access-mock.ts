import { vi } from 'vitest'

// Register before route modules load, irrespective of fixture import order.
const { jwtVerify } = vi.hoisted(() => ({
  jwtVerify: vi.fn<() => Promise<{ payload: import('jose').JWTPayload }>>(),
}))

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify, createRemoteJWKSet: vi.fn(actual.createRemoteJWKSet) }
})

export { jwtVerify }
