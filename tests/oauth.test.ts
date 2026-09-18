import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as status from '../app/api/v1/status/route'
import { authenticate } from '../lib/server/auth'
import { digest, randomToken } from '../lib/server/crypto'
import { protectedResourceResponse } from '../lib/server/discovery'
import { mcp } from '../lib/server/mcp'
import {
  accessIssuer,
  accessPrincipal,
  challenge,
  protectedResourceMetadata,
  resetAccessJwksCache,
  resourceMetadataUrl,
} from '../lib/server/oauth'
import { database } from './database'

const { jwtVerify } = vi.hoisted(() => ({ jwtVerify: vi.fn() }))
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    // eslint-disable-next-line ts/promise-function-async -- vi.fn already returns a Promise
    jwtVerify: (...args: unknown[]) => jwtVerify(...args) as ReturnType<typeof actual.jwtVerify>,
    createRemoteJWKSet: () => (() => {}) as ReturnType<typeof actual.createRemoteJWKSet>,
  }
})

const TEAM = 'https://example.cloudflareaccess.com'
const AUD = 'access-aud-tag'
const publishedTeam = process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN

let env: Env
let store: ReturnType<typeof database>
let usagePoints: AnalyticsEngineDataPoint[]
beforeEach(() => {
  store = database()
  usagePoints = []
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    USAGE_ANALYTICS: {
      writeDataPoint: (point) => {
        if (point !== undefined)
          usagePoints.push(point)
      },
    },
  }
  process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN = TEAM
  jwtVerify.mockReset()
  resetAccessJwksCache()
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
  if (publishedTeam === undefined)
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
  else
    process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN = publishedTeam
})

async function token(
  scopes = ['memory:read', 'memory:write'],
  ownerId = 'alice',
) {
  const secret = randomToken()
  await env.DB.prepare(
    'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      ownerId,
      'Test',
      await digest(secret),
      secret.slice(0, 12),
      JSON.stringify(scopes),
      null,
      new Date().toISOString(),
      '2099-01-01T00:00:00.000Z',
    )
    .run()
  return secret
}
function request(path: string, options: {
  secret?: string
  accessJwt?: string
  cookie?: string
  body?: unknown
} = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (options.secret !== undefined)
    headers.Authorization = `Bearer ${options.secret}`
  if (options.accessJwt !== undefined)
    headers['Cf-Access-Jwt-Assertion'] = options.accessJwt
  if (options.cookie !== undefined)
    headers.Cookie = options.cookie
  return new Request(`https://memory.example${path}`, {
    method: options.body === undefined ? 'GET' : 'POST',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}
function jsonRpc(id: number, method: string, params: unknown = {}) {
  return { jsonrpc: '2.0', id, method, params }
}
function accessToken(sub = 'alice') {
  jwtVerify.mockResolvedValue({ payload: { sub, aud: AUD, iss: TEAM } })
}

describe('access issuer resolution', () => {
  it('prefers the Worker env and trims a trailing slash', () => {
    expect(accessIssuer(env)).toBe(TEAM)
    expect(accessIssuer({ ACCESS_TEAM_DOMAIN: `${TEAM}/` })).toBe(TEAM)
  })
  it('falls back to the public build-time domain', () => {
    process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN = TEAM
    expect(accessIssuer({ ACCESS_TEAM_DOMAIN: undefined })).toBe(TEAM)
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
    expect(accessIssuer({ ACCESS_TEAM_DOMAIN: undefined })).toBeNull()
  })
})

describe('protected resource metadata', () => {
  it('describes the resource, the Access authorization server and the memory scopes', () => {
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
    expect(protectedResourceMetadata(env, 'https://memory.example')).toEqual({
      resource: 'https://memory.example',
      authorization_servers: [TEAM],
      scopes_supported: ['memory:read', 'memory:write', 'memory:delete'],
      bearer_methods_supported: ['header'],
    })
    expect(resourceMetadataUrl(env)).toBe(
      'https://memory.example/.well-known/oauth-protected-resource',
    )
    expect(
      protectedResourceMetadata({ ...env, ACCESS_TEAM_DOMAIN: undefined }, 'https://memory.example'),
    ).toBeNull()
  })
  it('serves the document publicly and fails closed without Access', async () => {
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
    const configured = protectedResourceResponse(
      new Request(resourceMetadataUrl(env)),
      env,
      '',
    )
    expect(configured.status).toBe(200)
    expect(configured.headers.get('access-control-allow-origin')).toBe('*')
    expect(configured.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await configured.json()).toMatchObject({
      resource: 'https://memory.example',
      authorization_servers: [TEAM],
    })
    const scoped = protectedResourceResponse(
      new Request(`${resourceMetadataUrl(env)}/mcp`),
      env,
      '/mcp',
    )
    expect(await scoped.json()).toMatchObject({ resource: 'https://memory.example/mcp' })
    const missing = protectedResourceResponse(
      new Request(resourceMetadataUrl(env)),
      { ...env, ACCESS_TEAM_DOMAIN: undefined },
      '',
    )
    expect(missing.status).toBe(503)
    expect(await missing.json()).toMatchObject({
      code: 'AUTH_NOT_CONFIGURED',
      status: 503,
      type: 'https://memory.example/errors/authorization-not-configured',
      instance: '/.well-known/oauth-protected-resource',
    })
    const preflight = protectedResourceResponse(
      new Request(resourceMetadataUrl(env), { method: 'OPTIONS' }),
      env,
      '',
    )
    expect(preflight.status).toBe(204)
  })
})

describe('access principal and challenge', () => {
  it('grants the full memory scope set to an Access identity', () => {
    expect(accessPrincipal('user_1')).toEqual({
      ownerId: 'user_1',
      tokenId: null,
      scopes: ['memory:read', 'memory:write', 'memory:delete'],
      project: null,
    })
  })
  it('builds an actionable challenge', () => {
    const header = challenge(env, {
      scopes: ['memory:read', 'memory:write'],
      error: 'insufficient_scope',
      description: 'Needs "memory:write"\nnow',
    })
    expect(header).toContain(
      'resource_metadata="https://memory.example/.well-known/oauth-protected-resource"',
    )
    expect(header).toContain('scope="memory:read memory:write"')
    expect(header).toContain('error="insufficient_scope"')
    expect(header).toContain('error_description="Needs memory:write now"')
    expect(header).not.toContain('\n')
  })
})

describe('access credentials', () => {
  it('verifies a Cf-Access-Jwt-Assertion for MCP', async () => {
    accessToken('alice')
    const principal = await authenticate(
      request('/mcp', { accessJwt: 'access.jwt' }),
      env,
      ['personal', 'oauth'],
    )
    expect(principal).toMatchObject({
      ownerId: 'alice',
      tokenId: null,
      scopes: ['memory:read', 'memory:write', 'memory:delete'],
    })
    expect(jwtVerify).toHaveBeenCalled()
  })
  it('accepts the CF_Authorization cookie as a session credential', async () => {
    accessToken('alice')
    const principal = await authenticate(
      request('/api/v1/memories', {
        cookie: 'CF_Authorization=access.jwt',
      }),
      env,
      ['session', 'personal'],
    )
    expect(principal.ownerId).toBe('alice')
  })
  it('reports a thrown verification failure as 401, never as a server error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    jwtVerify.mockRejectedValue(new Error('signature verification failed'))
    await expect(
      authenticate(request('/mcp', { accessJwt: 'garbage' }), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    const response = await mcp(
      request('/mcp', { accessJwt: 'garbage', body: jsonRpc(1, 'initialize') }),
      env,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
    logged.mockRestore()
  })
  it('rejects a service-token assertion with an empty subject', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: '', aud: AUD, iss: TEAM } })
    await expect(
      authenticate(request('/mcp', { accessJwt: 'service' }), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
  it('fails closed when Access is presented without configuration', async () => {
    await expect(
      authenticate(
        request('/mcp', { accessJwt: 'access.jwt' }),
        { ...env, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined },
        ['personal', 'oauth'],
      ),
    ).rejects.toMatchObject({ status: 503, code: 'AUTH_NOT_CONFIGURED' })
    expect(jwtVerify).not.toHaveBeenCalled()
  })
  it('accepts an Access JWT for credential preflight', async () => {
    accessToken('alice')
    const response = await status.GET(
      request('/api/v1/status', { accessJwt: 'access.jwt' }),
      { env, params: Promise.resolve({}) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      endpoint: 'https://memory.example',
      mcpUrl: 'https://memory.example/mcp',
      credential: {
        ready: true,
        scopes: ['memory:read', 'memory:write', 'memory:delete'],
        missingScopes: [],
        project: null,
      },
    })
  })
  it('does not treat a bare Bearer value as an Access session', async () => {
    accessToken('alice')
    await expect(
      authenticate(request('/api/v1/memories', { secret: 'not-a-mem-token' }), env),
    ).rejects.toMatchObject({ status: 401 })
    expect(jwtVerify).not.toHaveBeenCalled()
  })
  it('rejects personal tokens on endpoints that do not accept them', async () => {
    const secret = await token()
    await expect(
      authenticate(request('/mcp', { secret }), env, ['oauth']),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('mcp oauth surface', () => {
  it('challenges an unauthenticated request with the resource metadata', async () => {
    const response = await mcp(request('/mcp', { body: jsonRpc(1, 'tools/list') }), env)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://memory.example/.well-known/oauth-protected-resource"',
    )
  })
  it('serves a client that announces a newer protocol revision than the SDK supports', async () => {
    const key = await token()
    const newer = (method: string, params: unknown = {}) => {
      const base = request('/mcp', { secret: key, body: jsonRpc(1, method, params) })
      base.headers.set('mcp-protocol-version', '2026-07-28')
      return base
    }
    const discover = await mcp(newer('server/discover'), env)
    expect(discover.status).toBe(200)
    expect(await discover.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32601 },
    })
    const initialize = await mcp(
      newer('initialize', {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'openai-mcp', version: '1.0.0' },
      }),
      env,
    )
    expect(initialize.status).toBe(200)
    expect(await initialize.json()).toMatchObject({
      result: { protocolVersion: '2025-11-25', serverInfo: { name: 'shared-memory' } },
    })
    const listed = await mcp(newer('tools/list'), env)
    expect(listed.status).toBe(200)
    expect(JSON.stringify(await listed.json())).toContain('memory_search')
  })
  it('advertises security schemes per tool and hides scopes a personal token lacks', async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', { secret: key, body: jsonRpc(1, 'tools/list') }),
      env,
    )
    const payload: unknown = await response.json()
    const body = payload as {
      result: { tools: { name: string, securitySchemes: unknown, inputSchema: { properties?: Record<string, unknown> } }[] }
    }
    expect(body.result.tools.map(tool => tool.name)).toEqual([
      'memory_search',
      'memory_catalog_search',
      'memory_get',
      'memory_catalog',
    ])
    expect(body.result.tools[0]?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['memory:read'] },
    ])
  })
  it('searches the catalog through a structured MCP result', async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(1, 'tools/call', {
          name: 'memory_catalog_search',
          arguments: { query: 'database', project: 'global' },
        }),
      }),
      env,
    )
    expect(await response.json()).toMatchObject({
      result: {
        content: [{ type: 'text' }],
        structuredContent: { project: 'global', categories: [] },
      },
    })
  })
  it('advertises an output schema for every tool', async () => {
    const key = await token()
    const response = await mcp(
      request('/mcp', { secret: key, body: jsonRpc(1, 'tools/list') }),
      env,
    )
    const payload: unknown = await response.json()
    const body = payload as {
      result: { tools: { name: string, outputSchema: { type?: string, properties?: Record<string, unknown> } }[] }
    }
    expect(body.result.tools.map(tool => tool.name)).toEqual([
      'memory_search',
      'memory_catalog_search',
      'memory_get',
      'memory_create',
      'memory_update',
      'memory_catalog',
    ])
    for (const tool of body.result.tools) {
      expect(tool.outputSchema.type).toBe('object')
      expect(Object.keys(tool.outputSchema.properties ?? {}).length).toBeGreaterThan(0)
    }
  })
  it('returns structured content alongside the serialized JSON', async () => {
    const key = await token(['memory:read', 'memory:write', 'memory:delete'])
    const created = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(1, 'tools/call', {
          name: 'memory_create',
          arguments: {
            project: 'global',
            title: 'Structured results',
            content: 'A tool call returns both a text block and structured data.',
            kind: 'fact',
            tags: [],
            source: 'Test suite.',
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      }),
      env,
    )
    const payload: unknown = await created.json()
    const body = payload as {
      result: { content: { type: string, text: string }[], structuredContent: Record<string, unknown> }
    }
    const text = JSON.parse(body.result.content[0]?.text ?? '{}') as { id: string }
    expect(body.result.structuredContent).toMatchObject({
      id: text.id,
      project: 'global',
      title: 'Structured results',
      version: 1,
      kind: 'fact',
      tags: [],
    })
    const removed = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_delete',
          arguments: { id: text.id, expectedVersion: 1 },
        }),
      }),
      env,
    )
    const removedPayload: unknown = await removed.json()
    expect(
      (removedPayload as { result: { structuredContent: unknown } }).result
        .structuredContent,
    ).toEqual({ deleted: true })
  })
  it('returns a linking challenge when a personal token lacks the tool scope', async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_create',
          arguments: {
            project: 'global',
            title: 'Blocked write',
            content: 'A read-only link must not be able to save this.',
            kind: 'fact',
            tags: [],
            source: 'Test suite.',
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      }),
      env,
    )
    const payload: unknown = await response.json()
    const body = payload as {
      result: { isError: boolean, _meta?: Record<string, unknown> }
    }
    expect(body.result.isError).toBe(true)
    const header = (body.result._meta?.['mcp/www_authenticate'] as string[])[0] ?? ''
    expect(header).toContain('error="insufficient_scope"')
    expect(header).toContain('scope="memory:write"')
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM memories').first('n'),
    ).toBe(0)
  })
  it('serves personal tokens and Access JWTs on MCP', async () => {
    const secret = await token()
    const personal = await mcp(
      request('/mcp', {
        secret,
        body: jsonRpc(1, 'tools/call', {
          name: 'memory_search',
          arguments: { query: 'sqlc' },
        }),
      }),
      env,
    )
    expect(personal.status).toBe(200)
    accessToken('alice')
    const linked = await mcp(
      request('/mcp', {
        accessJwt: 'access.jwt',
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_search',
          arguments: { query: 'sqlc' },
        }),
      }),
      env,
    )
    expect(linked.status).toBe(200)
    expect(usagePoints.some(point => String(point.blobs?.[0] ?? '').length > 0)).toBe(true)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM usage_events').first('n')).toBe(0)
  })
})
