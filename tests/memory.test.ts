import type { Principal } from '../lib/contracts'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySchema } from '../lib/contracts'
import { en, zh } from '../lib/i18n/messages'
import { authenticate } from '../lib/server/auth'
import { digest, randomToken } from '../lib/server/crypto'
import { processIndexJobs } from '../lib/server/indexer'
import { mcp } from '../lib/server/mcp'
import {
  createMemory,
  deleteMemory,
  getMemory,
  history,
  searchMemories,
  updateMemory,
} from '../lib/server/memories'
import { ftsQuery } from '../lib/server/search'
import { api } from './api'
import { database } from './database'

const alice: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: ['memory:read', 'memory:write', 'memory:delete'],
  project: null,
}
const bob: Principal = { ...alice, ownerId: 'bob' }
const input = {
  title: 'Database access',
  content: '使用 sqlc/pgx 访问数据库，不使用 ORM。',
  kind: 'preference' as const,
  project: 'global',
  tags: ['backend'],
  source: 'User confirmed in the planning conversation, 2026-09-16.',
}
let env: Env
let store: ReturnType<typeof database>
let usagePoints: AnalyticsEngineDataPoint[]
beforeEach(() => {
  store = database()
  usagePoints = []
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    USAGE_ANALYTICS: {
      writeDataPoint: (point) => {
        if (point !== undefined)
          usagePoints.push(point)
      },
    },
  }
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})
async function create() {
  return createMemory(env, alice, {
    ...input,
    idempotencyKey: crypto.randomUUID(),
  })
}
async function token(
  ownerId = 'alice',
  scopes = ['memory:read', 'memory:write', 'memory:delete'],
  project: string | null = null,
) {
  const secret = randomToken()
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      ownerId,
      'Test',
      await digest(secret),
      secret.slice(0, 12),
      JSON.stringify(scopes),
      project,
      new Date().toISOString(),
      '2099-01-01T00:00:00.000Z',
    )
    .run()
  return { secret, id }
}
function request(path: string, secret: string, method = 'GET', body?: unknown) {
  return new Request(`https://memory.example${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
function vectors(matches: VectorizeMatch[] = []) {
  const query = vi.fn().mockResolvedValue({ matches })
  const upsert = vi.fn().mockResolvedValue({ mutationId: 'test' })
  const deleteByIds = vi.fn().mockResolvedValue({ mutationId: 'test' })
  env.VECTORIZE = { query, upsert, deleteByIds } as unknown as VectorizeIndex
  env.AI = {
    run: vi
      .fn()
      .mockResolvedValue({ data: [Array.from({ length: 1024 }).fill(0.1)] }),
  } as unknown as Ai
  return { query, upsert, deleteByIds }
}

describe('memory persistence and tenant boundaries', () => {
  it('keeps the serialized memory shape in step with the advertised schema', async () => {
    // The MCP output schema is strict, so a field added to serialize() without
    // updating memorySchema would turn every tool call into an error.
    const memory = await create()
    expect(() => memorySchema.parse(memory)).not.toThrow()
    expect(Object.keys(memory).sort()).toEqual(
      Object.keys(memorySchema.shape).sort(),
    )
  })
  it('saves a source, initial history, and durable index job atomically', async () => {
    const memory = await create()
    expect(memory.version).toBe(1)
    expect(await history(env, alice, memory.id)).toHaveLength(1)
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM index_jobs').first('n'),
    ).toBe(1)
  })
  it('deduplicates repeated creates and rejects idempotency payload drift', async () => {
    const payload = { ...input, idempotencyKey: crypto.randomUUID() }
    const first = await createMemory(env, alice, payload)
    expect((await createMemory(env, alice, payload)).id).toBe(first.id)
    expect(
      (
        await createMemory(env, alice, {
          ...payload,
          idempotencyKey: crypto.randomUUID(),
        })
      ).id,
    ).toBe(first.id)
    await expect(
      createMemory(env, alice, { ...payload, content: 'Different' }),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('isolates read, update, history, deletion and search between users', async () => {
    const memory = await create()
    await expect(getMemory(env, bob, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(history(env, bob, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      updateMemory(env, bob, memory.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(deleteMemory(env, bob, memory.id, 1)).rejects.toMatchObject({
      status: 404,
    })
    expect(
      (await searchMemories(env, bob, { query: '数据库' })).memories,
    ).toHaveLength(0)
  })
  it('rejects cross-project access and writes from a read-only principal', async () => {
    const memory = await create()
    const restricted = { ...alice, project: 'another-project' }
    await expect(getMemory(env, restricted, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      searchMemories(env, restricted, { query: 'sqlc' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      createMemory(
        env,
        { ...alice, scopes: ['memory:read'] },
        { ...input, idempotencyKey: crypto.randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('preserves revisions and rejects stale updates or deletes', async () => {
    const memory = await create()
    const updated = await updateMemory(env, alice, memory.id, {
      ...input,
      content: 'New verified fact',
      expectedVersion: 1,
    })
    expect(updated.version).toBe(2)
    expect(await history(env, alice, memory.id)).toHaveLength(2)
    await expect(
      updateMemory(env, alice, memory.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(deleteMemory(env, alice, memory.id, 1)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
  })
  it('forgets text and revisions and prevents identical automatic recreation', async () => {
    const memory = await create()
    await deleteMemory(env, alice, memory.id, 1)
    const row = await env.DB.prepare(
      'SELECT content, source, deleted FROM memories WHERE id = ?',
    )
      .bind(memory.id)
      .first()
    expect(row).toMatchObject({ content: '', source: '', deleted: 1 })
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM revisions').first('n'),
    ).toBe(0)
    expect(
      (await searchMemories(env, alice, { query: 'sqlc' })).memories,
    ).toEqual([])
    await expect(create()).rejects.toMatchObject({ code: 'FORGOTTEN' })
  })
})
describe('retrieval and eventual indexing', () => {
  it('finds Chinese substrings and code identifiers without default CJK segmentation', async () => {
    await create()
    expect(
      (await searchMemories(env, alice, { query: '数据库' })).memories,
    ).toHaveLength(1)
    expect(
      (await searchMemories(env, alice, { query: 'pgx' })).memories,
    ).toHaveLength(1)
    expect(ftsQuery('" OR 1=1; --')).not.toContain(';')
  })
  it('hydrates only current, authorized vectors and filters namespaces before querying', async () => {
    const own = await create()
    const other = await createMemory(env, bob, {
      ...input,
      idempotencyKey: crypto.randomUUID(),
    })
    const mocks = vectors([
      { id: `${other.id}:1`, score: 1 },
      { id: `${own.id}:99`, score: 1 },
      { id: `${own.id}:1`, score: 0.9 },
    ])
    const result = await searchMemories(env, alice, {
      query: 'How do I access relational storage?',
    })
    expect(result.mode).toBe('hybrid')
    expect(result.memories.map(memory => memory.id)).toEqual([own.id])
    expect(mocks.query).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        namespace: 'alice',
        filter: { project: 'global' },
      }),
    )
  })
  it('falls back to keywords when embedding fails', async () => {
    await create()
    vectors()
    env.AI = {
      run: vi.fn().mockRejectedValue(new Error('Unavailable')),
    } as unknown as Ai
    const result = await searchMemories(env, alice, { query: 'sqlc' })
    expect(result.degraded).toBe(true)
    expect(result.memories).toHaveLength(1)
  })
  it('retries failed indexing, then publishes only the current version', async () => {
    const memory = await create()
    const mocks = vectors()
    mocks.upsert.mockRejectedValueOnce(new Error('Provider failed'))
    await processIndexJobs(env)
    expect(
      await env.DB.prepare('SELECT attempts FROM index_jobs').first('attempts'),
    ).toBe(1)
    await updateMemory(env, alice, memory.id, {
      ...input,
      content: 'Current version',
      expectedVersion: 1,
    })
    await env.DB.prepare('UPDATE index_jobs SET available_at = 0').run()
    await processIndexJobs(env)
    expect(mocks.upsert).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: `${memory.id}:2` }),
    ])
    expect(mocks.deleteByIds).toHaveBeenCalledWith([`${memory.id}:1`])
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM index_jobs').first('n'),
    ).toBe(0)
  })
  it('removes a vector when deletion happens while embedding is running', async () => {
    const memory = await create()
    const mocks = vectors()
    env.AI = {
      run: async () => {
        await deleteMemory(env, alice, memory.id, 1)
        return { data: [Array.from({ length: 1024 }).fill(0)] }
      },
    } as unknown as Ai
    await processIndexJobs(env)
    expect(mocks.deleteByIds).toHaveBeenCalledWith([`${memory.id}:1`])
    expect(
      (await searchMemories(env, alice, { query: 'sqlc' })).memories,
    ).toEqual([])
  })
})
describe('hTTP, credentials and MCP', () => {
  it('rejects missing, invalid, expired and revoked tokens', async () => {
    expect(
      (await api(new Request('https://memory.example/api/v1/memories'), env))
        .status,
    ).toBe(401)
    expect(
      (await api(request('/api/v1/memories', 'mem_invalid'), env)).status,
    ).toBe(401)
    const key = await token()
    await env.DB.prepare(
      'UPDATE api_tokens SET expires_at = \'2020-01-01\' WHERE id = ?',
    )
      .bind(key.id)
      .run()
    expect(
      (await api(request('/api/v1/memories', key.secret), env)).status,
    ).toBe(401)
    const revoked = await token()
    await env.DB.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), revoked.id)
      .run()
    expect(
      (await api(request('/api/v1/memories', revoked.secret), env)).status,
    ).toBe(401)
  })
  it('hashes keys and rejects invalid origins, malformed JSON and oversized bodies', async () => {
    const key = await token()
    expect(
      await env.DB.prepare('SELECT digest FROM api_tokens WHERE id = ?')
        .bind(key.id)
        .first('digest'),
    ).not.toBe(key.secret)
    const cross = request('/api/v1/memories', key.secret)
    cross.headers.set('Origin', 'https://evil.example')
    await expect(authenticate(cross, env)).rejects.toMatchObject({
      status: 403,
    })
    const malformed = new Request('https://memory.example/api/v1/memories', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key.secret}`,
        'Content-Type': 'application/json',
      },
      body: '{',
    })
    expect((await api(malformed, env)).status).toBe(400)
    expect(
      (
        await api(
          request('/api/v1/memories', key.secret, 'POST', {
            content: 'x'.repeat(66000),
          }),
          env,
        )
      ).status,
    ).toBe(413)
  })
  it('records usage metadata without content and prevents API-key privilege escalation', async () => {
    const key = await token()
    const result = await api(
      request('/api/v1/memories', key.secret, 'POST', {
        ...input,
        idempotencyKey: crypto.randomUUID(),
      }),
      env,
    )
    expect(result.status).toBe(201)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect((await api(request('/api/v1/tokens', key.secret), env)).status).toBe(
      403,
    )
    expect((await api(request('/api/v1/usage', key.secret), env)).status).toBe(
      403,
    )
    expect(usagePoints).toHaveLength(3)
    expect(JSON.stringify(usagePoints)).not.toContain(input.content)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM usage_events').first('n')).toBe(0)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM rate_limits').first('n')).toBe(0)
  })
  it('limits requests per owner across different tokens', async () => {
    const first = await token()
    const second = await token()
    const limit = vi.fn().mockResolvedValue({ success: false })
    env.API_RATE_LIMITER = { limit }
    expect(
      (await api(request('/api/v1/memories', first.secret), env)).status,
    ).toBe(429)
    expect(
      (await api(request('/api/v1/memories', second.secret), env)).headers.get(
        'retry-after',
      ),
    ).toBe('60')
    expect(limit).toHaveBeenNthCalledWith(1, { key: 'alice' })
    expect(limit).toHaveBeenNthCalledWith(2, { key: 'alice' })
  })
  it('supports standard MCP initialization, discovery and tool calls over HTTP', async () => {
    const key = await token()
    const initialize = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
      env,
    )
    expect(initialize.status).toBe(200)
    expect(await initialize.json()).toMatchObject({
      result: { serverInfo: { name: 'shared-memory' } },
    })
    const list = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      env,
    )
    expect(JSON.stringify(await list.json())).toContain('memory_search')
    const saved = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'memory_create',
          arguments: { ...input, idempotencyKey: crypto.randomUUID() },
        },
      }),
      env,
    )
    expect(await saved.json()).toMatchObject({
      result: { content: [{ type: 'text' }] },
    })
    expect(
      (await searchMemories(env, alice, { query: 'sqlc' })).memories,
    ).toHaveLength(1)
  })
  it('does not advertise write tools to read-only MCP clients', async () => {
    const key = await token('alice', ['memory:read'])
    const list = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      env,
    )
    const text = await list.text()
    expect(text).toContain('memory_get')
    expect(text).not.toContain('memory_create')
    expect((await mcp(request('/mcp', key.secret), env)).status).toBe(405)
  })
})
it('provides Chinese translations for every English interface key', () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
})
