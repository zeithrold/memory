import { expect, it, vi } from 'vitest'
import { memorySchema } from '../lib/contracts'
import { processIndexJobs } from '../lib/server/indexer'
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
import { alice, bob, create, fixture, input, request, token, vectors } from './memory-fixture'

it(
  'memory persistence and tenant boundaries > keeps the serialized memory shape in step with the advertised schema',
  async () => {
  // The MCP output schema is strict, so a field added to serialize() without
  // updating memorySchema would turn every tool call into an error.
    const memory = await create()
    expect(() => memorySchema.parse(memory)).not.toThrow()
    expect(Object.keys(memory).sort()).toEqual(
      Object.keys(memorySchema.shape).sort(),
    )
  },
)

it(
  'memory persistence and tenant boundaries > saves a source, initial history, and durable index job atomically',
  async () => {
    const memory = await create()
    expect(memory.version).toBe(1)
    expect(await history(fixture.env, alice, memory.id)).toHaveLength(1)
    expect(
      await fixture.env.DB.prepare('SELECT count(*) AS n FROM index_jobs').first('n'),
    ).toBe(1)
  },
)

it(
  'memory persistence and tenant boundaries > deduplicates repeated creates and rejects idempotency payload drift',
  async () => {
    const payload = { ...input, idempotencyKey: crypto.randomUUID() }
    const first = await createMemory(fixture.env, alice, payload)
    expect((await createMemory(fixture.env, alice, payload)).id).toBe(first.id)
    expect(
      (
        await createMemory(fixture.env, alice, {
          ...payload,
          idempotencyKey: crypto.randomUUID(),
        })
      ).id,
    ).toBe(first.id)
    await expect(
      createMemory(fixture.env, alice, { ...payload, content: 'Different' }),
    ).rejects.toMatchObject({ status: 409 })
  },
)

it(
  'memory persistence and tenant boundaries > isolates read, update, history, deletion and search between users',
  async () => {
    const memory = await create()
    await expect(getMemory(fixture.env, bob, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(history(fixture.env, bob, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      updateMemory(fixture.env, bob, memory.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(deleteMemory(fixture.env, bob, memory.id, 1)).rejects.toMatchObject({
      status: 404,
    })
    expect(
      (await searchMemories(fixture.env, bob, { query: '数据库' })).memories,
    ).toHaveLength(0)
  },
)

it(
  'memory persistence and tenant boundaries > rejects cross-project access and writes from a read-only principal',
  async () => {
    const memory = await create()
    const restricted = { ...alice, project: 'another-project' }
    await expect(getMemory(fixture.env, restricted, memory.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      searchMemories(fixture.env, restricted, { query: 'sqlc' }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      createMemory(
        fixture.env,
        { ...alice, scopes: ['memory:read'] },
        { ...input, idempotencyKey: crypto.randomUUID() },
      ),
    ).rejects.toMatchObject({ status: 403 })
  },
)

it(
  'memory persistence and tenant boundaries > preserves revisions and rejects stale updates or deletes',
  async () => {
    const memory = await create()
    const updated = await updateMemory(fixture.env, alice, memory.id, {
      ...input,
      content: 'New verified fact',
      expectedVersion: 1,
    })
    expect(updated.version).toBe(2)
    expect(await history(fixture.env, alice, memory.id)).toHaveLength(2)
    await expect(
      updateMemory(fixture.env, alice, memory.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(deleteMemory(fixture.env, alice, memory.id, 1)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
  },
)

it(
  'memory persistence and tenant boundaries > forgets text and revisions and prevents identical automatic recreation',
  async () => {
    const memory = await create()
    await deleteMemory(fixture.env, alice, memory.id, 1)
    const row = await fixture.env.DB.prepare(
      'SELECT content, source, deleted FROM memories WHERE id = ?',
    )
      .bind(memory.id)
      .first()
    expect(row).toMatchObject({ content: '', source: '', deleted: 1 })
    expect(
      await fixture.env.DB.prepare('SELECT count(*) AS n FROM revisions').first('n'),
    ).toBe(0)
    expect(
      (await searchMemories(fixture.env, alice, { query: 'sqlc' })).memories,
    ).toEqual([])
    await expect(create()).rejects.toMatchObject({ code: 'FORGOTTEN' })
  },
)

it(
  'retrieval and eventual indexing > finds Chinese substrings and code identifiers without default CJK segmentation',
  async () => {
    await create()
    expect(
      (await searchMemories(fixture.env, alice, { query: '数据库' })).memories,
    ).toHaveLength(1)
    expect(
      (await searchMemories(fixture.env, alice, { query: 'pgx' })).memories,
    ).toHaveLength(1)
    expect(ftsQuery('" OR 1=1; --')).not.toContain(';')
  },
)

it(
  'retrieval and eventual indexing > hydrates only current, authorized vectors and filters namespaces before querying',
  async () => {
    const own = await create()
    const other = await createMemory(fixture.env, bob, {
      ...input,
      idempotencyKey: crypto.randomUUID(),
    })
    const mocks = vectors([
      { id: `${other.id}:1`, score: 1 },
      { id: `${own.id}:99`, score: 1 },
      { id: `${own.id}:1`, score: 0.9 },
    ])
    const result = await searchMemories(fixture.env, alice, {
      query: 'How do I access relational storage?',
    })
    expect(result.mode).toBe('hybrid')
    expect(result.memories.map(entry => entry.id)).toEqual([own.id])
    expect(mocks.query).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        namespace: 'alice',
        filter: { project: 'global' },
      }),
    )
  },
)

it(
  'retrieval and eventual indexing > falls back to keywords when embedding fails',
  async () => {
    await create()
    vectors()
    fixture.env.AI = {
      run: vi.fn().mockRejectedValue(new Error('Unavailable')),
    }
    const result = await searchMemories(fixture.env, alice, { query: 'sqlc' })
    expect(result.degraded).toBe(true)
    expect(result.memories).toHaveLength(1)
  },
)

it(
  'retrieval and eventual indexing > retries failed indexing, then publishes only the current version',
  async () => {
    const memory = await create()
    const mocks = vectors()
    mocks.upsert.mockRejectedValueOnce(new Error('Provider failed'))
    await processIndexJobs(fixture.env)
    expect(
      await fixture.env.DB.prepare('SELECT attempts FROM index_jobs').first('attempts'),
    ).toBe(1)
    await updateMemory(fixture.env, alice, memory.id, {
      ...input,
      content: 'Current version',
      expectedVersion: 1,
    })
    await fixture.env.DB.prepare('UPDATE index_jobs SET available_at = 0').run()
    await processIndexJobs(fixture.env)
    expect(mocks.upsert).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: `${memory.id}:2` }),
    ])
    expect(mocks.deleteByIds).toHaveBeenCalledWith([
      `${memory.id}:1`,
    ])
    expect(
      await fixture.env.DB.prepare('SELECT count(*) AS n FROM index_jobs').first('n'),
    ).toBe(0)
  },
)

it(
  'retrieval and eventual indexing > removes a vector when deletion happens while embedding is running',
  async () => {
    const memory = await create()
    const mocks = vectors()
    fixture.env.AI = {
      run: async () => {
        await deleteMemory(fixture.env, alice, memory.id, 1)
        return { data: [
          Array.from({ length: 1024 }).fill(0),
        ] }
      },
    }
    await processIndexJobs(fixture.env)
    expect(mocks.deleteByIds).toHaveBeenCalledWith([
      `${memory.id}:1`,
    ])
    expect(
      (await searchMemories(fixture.env, alice, { query: 'sqlc' })).memories,
    ).toEqual([])
  },
)

it(
  'hTTP, credentials and MCP > rejects missing, invalid, expired and revoked tokens',
  async () => {
    expect(
      (await api(new Request('https://memory.example/api/v1/memories'), fixture.env))
        .status,
    ).toBe(401)
    expect(
      (await api(request('/api/v1/memories', 'mem_invalid'), fixture.env)).status,
    ).toBe(401)
    const key = await token()
    await fixture.env.DB.prepare(
      'UPDATE api_tokens SET expires_at = \'2020-01-01\' WHERE id = ?',
    )
      .bind(key.id)
      .run()
    expect(
      (await api(request('/api/v1/memories', key.secret), fixture.env)).status,
    ).toBe(401)
    const revoked = await token()
    await fixture.env.DB.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), revoked.id)
      .run()
    expect(
      (await api(request('/api/v1/memories', revoked.secret), fixture.env)).status,
    ).toBe(401)
  },
)
