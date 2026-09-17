import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as catalogMetrics from '../app/api/v1/catalog/metrics/route'
import * as proposal from '../app/api/v1/catalog/proposals/[id]/route'
import * as proposals from '../app/api/v1/catalog/proposals/route'
import * as catalog from '../app/api/v1/catalog/route'
import * as revert from '../app/api/v1/catalog/runs/[id]/revert/route'
import * as run from '../app/api/v1/catalog/runs/[id]/route'
import * as runs from '../app/api/v1/catalog/runs/route'
import * as settings from '../app/api/v1/catalog/settings/route'
import * as settingsTest from '../app/api/v1/catalog/settings/test/route'
import * as history from '../app/api/v1/memories/[id]/history/route'
import * as memory from '../app/api/v1/memories/[id]/route'
import * as memories from '../app/api/v1/memories/route'
import * as search from '../app/api/v1/search/route'
import * as status from '../app/api/v1/status/route'
import * as token from '../app/api/v1/tokens/[id]/route'
import * as tokens from '../app/api/v1/tokens/route'
import * as usage from '../app/api/v1/usage/route'
import { database } from './database'

const holder = vi.hoisted(() => ({ env: {} as Env }))
vi.mock('cloudflare:workers', () => ({ ...holder, waitUntil: vi.fn() }))
let store: ReturnType<typeof database>

beforeEach(() => {
  store = database()
  holder.env = { DB: store.db, APP_ORIGIN: 'https://memory.example' } satisfies Env
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

const routes = [
  ['/api/v1/memories', memories, ['GET', 'POST']],
  ['/api/v1/memories/00000000-0000-4000-8000-000000000000', memory, ['GET', 'PATCH', 'DELETE']],
  ['/api/v1/memories/00000000-0000-4000-8000-000000000000/history', history, ['GET']],
  ['/api/v1/search', search, ['POST']],
  ['/api/v1/tokens', tokens, ['GET', 'POST']],
  ['/api/v1/tokens/00000000-0000-4000-8000-000000000000', token, ['DELETE']],
  ['/api/v1/usage', usage, ['GET']],
  ['/api/v1/status', status, ['GET']],
  ['/api/v1/catalog', catalog, ['GET']],
  ['/api/v1/catalog/settings', settings, ['GET', 'PUT']],
  ['/api/v1/catalog/settings/test', settingsTest, ['POST']],
  ['/api/v1/catalog/metrics', catalogMetrics, ['GET']],
  ['/api/v1/catalog/runs', runs, ['GET', 'POST']],
  ['/api/v1/catalog/runs/00000000-0000-4000-8000-000000000000', run, ['GET']],
  ['/api/v1/catalog/runs/00000000-0000-4000-8000-000000000000/revert', revert, ['POST']],
  ['/api/v1/catalog/proposals', proposals, ['GET']],
  ['/api/v1/catalog/proposals/00000000-0000-4000-8000-000000000000', proposal, ['POST']],
] as const
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

describe('explicit API route contract', () => {
  it.each(routes)('%s exports supported handlers and precise 405 responses', async (path, route, allowed) => {
    expect(route.dynamic).toBe('force-dynamic')
    for (const method of methods) {
      const handler = route[method]
      expect(handler).toBeTypeOf('function')
      const response = await handler(
        new Request(`https://memory.example${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(['POST', 'PUT', 'PATCH'].includes(method) ? { body: '{}' } : {}),
        }),
        { env: holder.env, params: Promise.resolve({}) },
      )
      if ((allowed as readonly string[]).includes(method)) {
        expect(response.status).toBe(401)
      }
      else {
        expect(response.status).toBe(405)
        expect(response.headers.get('allow')).toBe(allowed.join(', '))
        expect(await response.json()).toMatchObject({ code: 'METHOD_NOT_ALLOWED', instance: path })
      }
    }
  })
})
