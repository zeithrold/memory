import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticate, preAuthRateLimit, rateLimit } from '../lib/server/auth'
import { digest, randomToken } from '../lib/server/crypto'
import { getUsage, recordUsage } from '../lib/server/usage'
import { database } from './database'

let store: ReturnType<typeof database>
let env: Env

beforeEach(() => {
  store = database()
  env = { DB: store.db, APP_ORIGIN: 'https://memory.example' }
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

async function personalToken(lastUsed: string | null = null) {
  const secret = randomToken()
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, 'alice', 'CLI', await digest(secret), secret.slice(0, 12), '["memory:read"]', null, '2026-09-17', '2099-01-01', lastUsed).run()
  return { id, secret }
}

describe('write-free request telemetry', () => {
  it('uses independent pre-auth IP and authenticated owner limiters', async () => {
    const authLimit = vi.fn().mockResolvedValue({ success: true })
    const apiLimit = vi.fn().mockResolvedValue({ success: true })
    env.AUTH_RATE_LIMITER = { limit: authLimit }
    env.API_RATE_LIMITER = { limit: apiLimit }
    await preAuthRateLimit(new Request('https://memory.example/api/v1/memories', {
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    }), env)
    await rateLimit(env, {
      ownerId: 'alice',
      tokenId: null,
      scopes: ['memory:read'],
      project: null,
    })
    expect(authLimit).toHaveBeenCalledWith({ key: '203.0.113.7' })
    expect(apiLimit).toHaveBeenCalledWith({ key: 'alice' })
    expect(await env.DB.prepare('SELECT count(*) AS n FROM rate_limits').first('n')).toBe(0)
  })

  it('updates personal-token activity at most once per hour', async () => {
    const recent = '2098-12-31T23:30:00.000Z'
    const recentToken = await personalToken(recent)
    await authenticate(new Request('https://memory.example/api/v1/memories', {
      headers: { Authorization: `Bearer ${recentToken.secret}` },
    }), env)
    expect(await env.DB.prepare('SELECT last_used_at FROM api_tokens WHERE id = ?').bind(recentToken.id).first('last_used_at')).toBe(recent)

    const oldToken = await personalToken('2020-01-01T00:00:00.000Z')
    await authenticate(new Request('https://memory.example/api/v1/memories', {
      headers: { Authorization: `Bearer ${oldToken.secret}` },
    }), env)
    await Promise.resolve()
    expect(await env.DB.prepare('SELECT last_used_at FROM api_tokens WHERE id = ?').bind(oldToken.id).first('last_used_at')).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('writes only the approved Analytics Engine fields', () => {
    const writeDataPoint = vi.fn()
    env.USAGE_ANALYTICS = { writeDataPoint }
    recordUsage(env, {
      ownerId: 'alice',
      tokenId: 'token-id',
      clientId: 'client-id',
      scopes: ['memory:read'],
      project: null,
    }, 'POST search', 500, Date.now() - 12)
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['alice'],
      blobs: ['token-id', 'client-id', 'POST search'],
      doubles: [expect.any(Number), 1],
    })
    const payload = JSON.stringify(writeDataPoint.mock.calls)
    for (const secret of ['memory body', 'search query', '203.0.113.7', 'alice@example.com'])
      expect(payload).not.toContain(secret)
  })

  it('merges legacy and sampled analytics usage and fills token names', async () => {
    const key = await personalToken()
    await env.DB.prepare(
      'INSERT INTO usage_events(id, owner_id, token_id, operation, status, duration_ms, created_at, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind('legacy-1', 'alice', key.id, 'GET memories', 200, 10, new Date().toISOString(), null).run()
    env.CLOUDFLARE_ACCOUNT_ID = 'account-id'
    env.ANALYTICS_READ_TOKEN = 'read-token'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{
      day: new Date().toISOString().slice(0, 10),
      token_id: key.id,
      client_id: '',
      operation: 'GET memories',
      calls: 2,
      errors: 1,
      average_ms: 20,
    }] })))
    const result = await getUsage(env, 'alice')
    expect(result.degraded).toBe(false)
    expect(result.usage).toEqual([expect.objectContaining({
      token_name: 'CLI',
      calls: 3,
      errors: 1,
      average_ms: 17,
    })])
    expect(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).toContain('_sample_interval')
  })

  it('returns legacy usage with degraded=true when Analytics is unavailable', async () => {
    await env.DB.prepare(
      'INSERT INTO usage_events(id, owner_id, operation, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('legacy-1', 'alice', 'GET memories', 200, 10, new Date().toISOString()).run()
    const result = await getUsage(env, 'alice')
    expect(result.degraded).toBe(true)
    expect(result.usage).toHaveLength(1)
  })
})
