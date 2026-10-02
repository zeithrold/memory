import { expect, it, vi } from 'vitest'
import { en, zh } from '../lib/i18n/messages'
import { authenticate } from '../lib/server/auth'
import { mcp } from '../lib/server/mcp'
import {
  createMemory,
  searchMemories,
} from '../lib/server/memories'
import { api } from './api'
import { alice, create, fixture, input, request, token } from './memory-fixture'

it(
  'hTTP, credentials and MCP > hashes keys and rejects invalid origins, malformed JSON and oversized bodies',
  async () => {
    const key = await token()
    expect(
      await fixture.env.DB.prepare('SELECT digest FROM api_tokens WHERE id = ?')
        .bind(key.id)
        .first('digest'),
    ).not.toBe(key.secret)
    const cross = request('/api/v1/memories', key.secret)
    cross.headers.set('Origin', 'https://evil.example')
    await expect(authenticate(cross, fixture.env)).rejects.toMatchObject({
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
    expect((await api(malformed, fixture.env)).status).toBe(400)
    expect(
      (
        await api(
          request('/api/v1/memories', key.secret, 'POST', {
            content: 'x'.repeat(66000),
          }),
          fixture.env,
        )
      ).status,
    ).toBe(413)
  },
)

it(
  'hTTP, credentials and MCP > records usage metadata without content and prevents API-key privilege escalation',
  async () => {
    const key = await token()
    const result = await api(
      request('/api/v1/memories', key.secret, 'POST', {
        ...input,
        idempotencyKey: crypto.randomUUID(),
      }),
      fixture.env,
    )
    expect(result.status).toBe(201)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect((await api(request('/api/v1/tokens', key.secret), fixture.env)).status).toBe(
      403,
    )
    expect((await api(request('/api/v1/usage', key.secret), fixture.env)).status).toBe(
      403,
    )
    expect(fixture.usagePoints).toHaveLength(3)
    expect(JSON.stringify(fixture.usagePoints)).not.toContain(input.content)
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM usage_events').first('n')).toBe(
      0,
    )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM rate_limits').first('n')).toBe(
      0,
    )
  },
)

it(
  'hTTP, credentials and MCP > preflights personal credentials and scopes status to their project',
  async () => {
    await create()
    await createMemory(fixture.env, alice, {
      ...input,
      project: 'private',
      idempotencyKey: crypto.randomUUID(),
    })
    const key = await token('alice', ['memory:read', 'memory:write'], 'global')
    const response = await api(request('/api/v1/status', key.secret), fixture.env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      endpoint: 'https://memory.example',
      mcpUrl: 'https://memory.example/mcp',
      credential: {
        ready: true,
        scopes: ['memory:read', 'memory:write'],
        missingScopes: [],
        project: 'global',
      },
      semanticEnabled: false,
      index: { pending: 1, retrying: 0 },
    })

    const readOnly = await token('alice', ['memory:read'])
    const incomplete = await api(request('/api/v1/status', readOnly.secret), fixture.env)
    expect(await incomplete.json()).toMatchObject({
      credential: { ready: false, missingScopes: ['memory:write'] },
    })
  },
)

it(
  'hTTP, credentials and MCP > exposes project-filtered catalog search to read credentials',
  async () => {
    const key = await token('alice', ['memory:read'], 'global')
    const allowed = await api(
      request('/api/v1/catalog/search', key.secret, 'POST', {
        query: 'database',
        project: 'global',
      }),
      fixture.env,
    )
    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toEqual({ project: 'global', categories: [] })
    const denied = await api(
      request('/api/v1/catalog/search', key.secret, 'POST', {
        query: 'database',
        project: 'another-project',
      }),
      fixture.env,
    )
    expect(denied.status).toBe(403)
  },
)

it(
  'hTTP, credentials and MCP > limits requests per owner across different tokens',
  async () => {
    const first = await token()
    const second = await token()
    const limit = vi.fn().mockResolvedValue({ success: false })
    fixture.env.API_RATE_LIMITER = { limit }
    expect(
      (await api(request('/api/v1/memories', first.secret), fixture.env)).status,
    ).toBe(429)
    expect(
      (await api(request('/api/v1/memories', second.secret), fixture.env)).headers.get(
        'retry-after',
      ),
    ).toBe('60')
    expect(limit).toHaveBeenNthCalledWith(1, { key: 'alice' })
    expect(limit).toHaveBeenNthCalledWith(2, { key: 'alice' })
  },
)

it(
  'hTTP, credentials and MCP > supports standard MCP initialization, discovery and tool calls over HTTP',
  async () => {
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
      fixture.env,
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
      fixture.env,
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
      fixture.env,
    )
    expect(await saved.json()).toMatchObject({
      result: { content: [
        { type: 'text' },
      ] },
    })
    expect(
      (await searchMemories(fixture.env, alice, { query: 'sqlc' })).memories,
    ).toHaveLength(1)
  },
)

it(
  'hTTP, credentials and MCP > does not advertise write tools to read-only MCP clients',
  async () => {
    const key = await token('alice', ['memory:read'])
    const list = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      fixture.env,
    )
    const text = await list.text()
    expect(text).toContain('memory_get')
    expect(text).toContain('memory_catalog_search')
    expect(text).not.toContain('memory_create')
    expect((await mcp(request('/mcp', key.secret), fixture.env)).status).toBe(405)
  },
)

it(
  'hTTP, credentials and MCP > hides the account-wide catalog from project-restricted MCP clients',
  async () => {
    const key = await token('alice', ['memory:read'], 'global')
    const list = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      fixture.env,
    )
    const text = await list.text()
    expect(text).toContain('memory_catalog_search')
    expect(text).not.toContain('"name":"memory_catalog"')

    const direct = await mcp(
      request('/mcp', key.secret, 'POST', {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'memory_catalog', arguments: {} },
      }),
      fixture.env,
    )
    expect(await direct.json()).toMatchObject({
      result: { isError: true },
    })
  },
)

it('provides Chinese translations for every English interface key', () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
})
