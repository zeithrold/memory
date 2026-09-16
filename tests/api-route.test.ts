import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from './database'

/**
 * The App Router answers 405 for any HTTP method a route module does not
 * export, so a verb that the service layer dispatches on but this module omits
 * is unreachable in production and invisible to service-level tests. That is
 * exactly how `PUT /api/v1/catalog/settings` shipped broken: `api()` handled the
 * method, the route re-exported only GET/POST/PATCH/DELETE, and every test
 * called `api()` directly.
 *
 * These tests therefore go through the route module, which is the only place
 * the omission is observable.
 */
const holder = vi.hoisted(() => ({ env: {} }))
vi.mock('cloudflare:workers', () => holder)

let store: ReturnType<typeof database>

beforeEach(() => {
  store = database()
  holder.env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    CLERK_SECRET_KEY: 'sk_test_placeholder',
  } satisfies Env
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

const METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'] as const
const PATHS = ['/api/v1/memories', '/api/v1/catalog/settings'] as const

describe('the api route module', () => {
  it('exports a handler for every verb the service dispatches on', async () => {
    const route: Record<string, unknown> = await import('../app/api/v1/[[...path]]/route')
    for (const method of METHODS)
      expect(route[method], `route.ts does not export ${method}`).toBeTypeOf('function')
    expect(route.dynamic).toBe('force-dynamic')
  })

  it.each(METHODS)('routes %s instead of answering 405', async (method) => {
    const route: Record<string, unknown> = await import('../app/api/v1/[[...path]]/route')
    const handler = route[method]
    expect(handler).toBeTypeOf('function')
    const handle = handler as (request: Request) => Promise<Response>
    for (const path of PATHS) {
      const response = await handle(
        new Request(`https://memory.example${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
        }),
      )
      // Without a credential every one of these is a 401. The point is that it
      // is not a 405, which would mean the method never reached the service.
      expect(response.status, `${method} ${path}`).toBe(401)
      expect(await response.json()).toMatchObject({
        code: 'UNAUTHORIZED',
        instance: path,
      })
    }
  })
})
