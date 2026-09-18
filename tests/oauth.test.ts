import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as status from '../app/api/v1/status/route'
import { authenticate } from '../lib/server/auth'
import { digest, randomToken } from '../lib/server/crypto'
import { protectedResourceResponse } from '../lib/server/discovery'
import { mcp } from '../lib/server/mcp'
import {
  challenge,
  clerkIssuer,
  issuerFromPublishableKey,
  mapOauthScopes,
  oauthPrincipal,
  protectedResourceMetadata,
  resetOauthCache,
  resourceMetadataUrl,
} from '../lib/server/oauth'
import { database } from './database'

// The Clerk SDK is the only way to verify a real OAuth token. Everything this
// application decides from the verified identity is exercised for real below.
const { authenticateRequest, createClerkClient } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createClerkClient: vi.fn(),
}))
vi.mock('@clerk/backend', () => ({
  createClerkClient: (options: unknown) => {
    createClerkClient(options)
    return { authenticateRequest }
  },
  verifyToken: vi.fn().mockRejectedValue(new Error('not a session token')),
}))

// Decodes to https://unique-gelding-15.clerk.accounts.dev
const PUBLISHABLE_KEY
  = 'pk_test_dW5pcXVlLWdlbGRpbmctMTUuY2xlcmsuYWNjb3VudHMuZGV2JA=='
const publishedKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

let env: Env
let store: ReturnType<typeof database>
let usagePoints: AnalyticsEngineDataPoint[]
beforeEach(() => {
  store = database()
  usagePoints = []
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    CLERK_SECRET_KEY: 'sk_test_placeholder',
    CLERK_ISSUER: 'https://clerk.example',
    USAGE_ANALYTICS: {
      writeDataPoint: (point) => {
        if (point !== undefined)
          usagePoints.push(point)
      },
    },
  }
  // Deployments always inline the publishable key; tests that need it absent
  // delete it explicitly.
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY
  authenticateRequest.mockReset()
  createClerkClient.mockReset()
  resetOauthCache()
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
  if (publishedKey === undefined)
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  else
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishedKey
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
function request(path: string, secret?: string, body?: unknown) {
  return new Request(`https://memory.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(secret === undefined ? {} : { Authorization: `Bearer ${secret}` }),
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
function jsonRpc(id: number, method: string, params: unknown = {}) {
  return { jsonrpc: '2.0', id, method, params }
}
function oauthToken(
  scopes: string[],
  clientId: string | null = 'https://chatgpt.com/oauth/callback-1/client.json',
) {
  authenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    toAuth: () => ({
      userId: 'alice',
      clientId,
      scopes,
    }),
  })
}

describe('clerk issuer resolution', () => {
  it('decodes the frontend API host from a publishable key', () => {
    expect(issuerFromPublishableKey(PUBLISHABLE_KEY)).toBe(
      'https://unique-gelding-15.clerk.accounts.dev',
    )
    expect(issuerFromPublishableKey('pk_live_not-base64!')).toBeNull()
    expect(issuerFromPublishableKey('')).toBeNull()
  })
  it('prefers the explicit issuer and trims a trailing slash', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY
    expect(clerkIssuer(env)).toBe('https://clerk.example')
    expect(clerkIssuer({ ...env, CLERK_ISSUER: 'https://clerk.example/' })).toBe(
      'https://clerk.example',
    )
  })
  it('falls back to the publishable key and reports a missing configuration', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = PUBLISHABLE_KEY
    expect(clerkIssuer({ CLERK_ISSUER: undefined })).toBe(
      'https://unique-gelding-15.clerk.accounts.dev',
    )
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    expect(clerkIssuer({ CLERK_ISSUER: undefined })).toBeNull()
  })
})

describe('protected resource metadata', () => {
  it('describes the resource, the Clerk authorization server and the memory scopes', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    expect(protectedResourceMetadata(env, 'https://memory.example')).toEqual({
      resource: 'https://memory.example',
      authorization_servers: ['https://clerk.example'],
      scopes_supported: ['memory:read', 'memory:write', 'memory:delete'],
      bearer_methods_supported: ['header'],
    })
    expect(resourceMetadataUrl(env)).toBe(
      'https://memory.example/.well-known/oauth-protected-resource',
    )
    expect(
      protectedResourceMetadata({ ...env, CLERK_ISSUER: undefined }, 'https://memory.example'),
    ).toBeNull()
  })
  it('serves the document publicly and fails closed without Clerk', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
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
      authorization_servers: ['https://clerk.example'],
    })
    const scoped = protectedResourceResponse(
      new Request(`${resourceMetadataUrl(env)}/mcp`),
      env,
      '/mcp',
    )
    expect(await scoped.json()).toMatchObject({ resource: 'https://memory.example/mcp' })
    const missing = protectedResourceResponse(
      new Request(resourceMetadataUrl(env)),
      { ...env, CLERK_ISSUER: undefined },
      '',
    )
    expect(missing.status).toBe(503)
    expect(await missing.json()).toMatchObject({
      code: 'AUTH_NOT_CONFIGURED',
      status: 503,
      type: 'https://memory.example/errors/authorization-not-configured',
      instance: '/.well-known/oauth-protected-resource',
    })
    expect(
      protectedResourceResponse(new Request(resourceMetadataUrl(env)), env, '').headers.get(
        'allow',
      ),
    ).toBeNull()
    const preflight = protectedResourceResponse(
      new Request(resourceMetadataUrl(env), { method: 'OPTIONS' }),
      env,
      '',
    )
    expect(preflight.status).toBe(204)
  })
})

describe('oauth scope mapping', () => {
  it('keeps only memory scopes and the OAuth client identity', () => {
    expect(mapOauthScopes(['openid', 'email', 'memory:write', 'unknown'])).toEqual([
      'memory:write',
    ])
    expect(
      oauthPrincipal({
        userId: 'user_1',
        clientId: 'https://chatgpt.com/oauth/callback-1/client.json',
        scopes: ['openid', 'memory:read'],
      }),
    ).toEqual({
      ownerId: 'user_1',
      tokenId: null,
      scopes: ['memory:read'],
      project: null,
      clientId: 'https://chatgpt.com/oauth/callback-1/client.json',
    })
    // Dynamically registered and pre-registered clients use opaque identifiers
    // rather than CIMD document URLs, and nothing downstream may assume a URL.
    expect(
      oauthPrincipal({
        userId: 'user_1',
        clientId: 'client_2vB7qLmN4pQr',
        scopes: ['memory:read'],
      }),
    ).toMatchObject({ clientId: 'client_2vB7qLmN4pQr' })
  })
  it('refuses a link without memory scopes and builds an actionable challenge', () => {
    expect(() =>
      oauthPrincipal({ userId: 'user_1', clientId: null, scopes: ['openid'] }),
    ).toThrowError(
      expect.objectContaining({ status: 403, code: 'INSUFFICIENT_SCOPE' }),
    )
    expect(() =>
      oauthPrincipal({ userId: null, clientId: null, scopes: ['memory:read'] }),
    ).toThrowError(expect.objectContaining({ status: 403 }))
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

describe('oauth credentials', () => {
  it('builds the Clerk client with the publishable key OAuth verification needs', async () => {
    oauthToken(['memory:read'])
    await authenticate(request('/mcp', 'oauth-access-token'), env, [
      'personal',
      'oauth',
    ])
    // Without it Clerk throws "Publishable key is missing" on every OAuth token.
    expect(createClerkClient).toHaveBeenCalledWith({
      secretKey: 'sk_test_placeholder',
      publishableKey: PUBLISHABLE_KEY,
    })
  })
  it('reports a thrown verification failure as 401, never as a server error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    authenticateRequest.mockRejectedValue(new Error('Publishable key is missing'))
    await expect(
      authenticate(request('/mcp', 'garbage'), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    const response = await mcp(
      request('/mcp', 'garbage', jsonRpc(1, 'initialize')),
      env,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
    logged.mockRestore()
  })
  it('treats a token without a scope claim as insufficient scope, not a crash', async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: 'alice', clientId: null, scopes: undefined }),
    })
    await expect(
      authenticate(request('/mcp', 'oauth-access-token'), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 403, code: 'INSUFFICIENT_SCOPE' })
  })
  it('fails closed when the instance publishable key is unavailable', async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    oauthToken(['memory:read'])
    await expect(
      authenticate(request('/mcp', 'oauth-access-token'), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 503, code: 'AUTH_NOT_CONFIGURED' })
    expect(authenticateRequest).not.toHaveBeenCalled()
  })
  it('maps a verified OAuth token onto the MCP principal', async () => {
    oauthToken(['openid', 'email', 'memory:read', 'memory:write'])
    const principal = await authenticate(
      request('/mcp', 'oauth-access-token'),
      env,
      ['personal', 'oauth'],
    )
    expect(principal).toMatchObject({
      ownerId: 'alice',
      tokenId: null,
      scopes: ['memory:read', 'memory:write'],
    })
  })
  it('accepts an OAuth token for credential preflight only', async () => {
    oauthToken(['openid', 'memory:read', 'memory:write'])
    const response = await status.GET(
      request('/api/v1/status', 'oauth-access-token'),
      { env, params: Promise.resolve({}) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      endpoint: 'https://memory.example',
      mcpUrl: 'https://memory.example/mcp',
      credential: {
        ready: true,
        scopes: ['memory:read', 'memory:write'],
        missingScopes: [],
        project: null,
      },
    })
  })
  it('never accepts an OAuth token on the REST credential kinds', async () => {
    oauthToken(['memory:read'])
    await expect(authenticate(request('/api/v1/memories'), env)).rejects.toMatchObject(
      { status: 401 },
    )
  })
  it('rejects an unauthenticated OAuth attempt and a missing Clerk secret', async () => {
    authenticateRequest.mockResolvedValue({ isAuthenticated: false })
    await expect(
      authenticate(request('/mcp', 'oauth-access-token'), env, ['personal', 'oauth']),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      authenticate(
        request('/mcp', 'oauth-access-token'),
        { ...env, CLERK_SECRET_KEY: undefined },
        ['personal', 'oauth'],
      ),
    ).rejects.toMatchObject({ status: 503, code: 'AUTH_NOT_CONFIGURED' })
  })
  it('rejects personal tokens on endpoints that do not accept them', async () => {
    const secret = await token()
    await expect(
      authenticate(request('/mcp', secret), env, ['oauth']),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('mcp oauth surface', () => {
  it('challenges an unauthenticated request with the resource metadata', async () => {
    const response = await mcp(request('/mcp', undefined, jsonRpc(1, 'tools/list')), env)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://memory.example/.well-known/oauth-protected-resource"',
    )
  })
  it('serves a client that announces a newer protocol revision than the SDK supports', async () => {
    const key = await token()
    const newer = (method: string, params: unknown = {}) => {
      const base = request('/mcp', key, jsonRpc(1, method, params))
      base.headers.set('mcp-protocol-version', '2026-07-28')
      return base
    }
    // ChatGPT sends this combination; the pinned SDK would answer 400 first.
    const discover = await mcp(newer('server/discover'), env)
    expect(discover.status).toBe(200)
    expect(await discover.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32601 },
    })
    // Version negotiation still answers with the revision this server implements.
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
  it('advertises security schemes per tool and hides scopes the link lacks', async () => {
    oauthToken(['openid', 'memory:read'])
    const response = await mcp(
      request('/mcp', 'oauth-token', jsonRpc(1, 'tools/list')),
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
      // Read-only, so a read-scoped link sees it too.
      'memory_catalog',
    ])
    expect(body.result.tools[0]?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['memory:read'] },
    ])
    expect(Object.keys(body.result.tools[0]?.inputSchema.properties ?? {})).toContain(
      'query',
    )
    expect(Object.keys(body.result.tools[0]?.inputSchema.properties ?? {})).toContain(
      'categoryIds',
    )
  })
  it('searches the catalog through a structured MCP result', async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', key, jsonRpc(1, 'tools/call', {
        name: 'memory_catalog_search',
        arguments: { query: 'database', project: 'global' },
      })),
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
      request('/mcp', key, jsonRpc(1, 'tools/list')),
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
    const search = body.result.tools.find(tool => tool.name === 'memory_search')
    expect(Object.keys(search?.outputSchema.properties ?? {})).toEqual([
      'memories',
      'mode',
      'degraded',
      // Routing metadata, so a caller can tell that a catalog route missed.
      'catalog',
    ])
    const catalogSearch = body.result.tools.find(tool => tool.name === 'memory_catalog_search')
    expect(Object.keys(catalogSearch?.outputSchema.properties ?? {})).toEqual([
      'project',
      'categories',
    ])
    const catalog = body.result.tools.find(tool => tool.name === 'memory_catalog')
    expect(Object.keys(catalog?.outputSchema.properties ?? {})).toEqual([
      'version',
      'updatedAt',
      'categories',
      'assigned',
      'orphans',
      'skipped',
      'pendingProposals',
    ])
    const create = body.result.tools.find(tool => tool.name === 'memory_create')
    expect(Object.keys(create?.outputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['id', 'version', 'createdAt', 'updatedAt']),
    )
  })
  it('returns structured content alongside the serialized JSON', async () => {
    // Deletion is only registered for a token that holds the scope.
    const key = await token(['memory:read', 'memory:write', 'memory:delete'])
    const created = await mcp(
      request('/mcp', key, jsonRpc(1, 'tools/call', {
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
      })),
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
    // Strict output schema: exactly these fields, in any order.
    expect(Object.keys(body.result.structuredContent).sort()).toEqual([
      'content',
      'createdAt',
      'id',
      'kind',
      'project',
      'source',
      'tags',
      'title',
      'updatedAt',
      'version',
    ])
    const removed = await mcp(
      request('/mcp', key, jsonRpc(2, 'tools/call', {
        name: 'memory_delete',
        arguments: { id: text.id, expectedVersion: 1 },
      })),
      env,
    )
    const removedPayload: unknown = await removed.json()
    expect(
      (removedPayload as { result: { structuredContent: unknown } }).result
        .structuredContent,
    ).toEqual({ deleted: true })
  })
  it('returns a linking challenge when the link lacks the tool scope', async () => {
    oauthToken(['memory:read'])
    const response = await mcp(
      request(
        '/mcp',
        'oauth-token',
        jsonRpc(2, 'tools/call', {
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
      ),
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
  it('still serves personal tokens and attributes OAuth usage to its client', async () => {
    const secret = await token()
    const personal = await mcp(
      request('/mcp', secret, jsonRpc(1, 'tools/call', {
        name: 'memory_search',
        arguments: { query: 'sqlc' },
      })),
      env,
    )
    expect(personal.status).toBe(200)
    oauthToken(['memory:read'])
    const linked = await mcp(
      request('/mcp', 'oauth-token', jsonRpc(2, 'tools/call', {
        name: 'memory_search',
        arguments: { query: 'sqlc' },
      })),
      env,
    )
    expect(linked.status).toBe(200)
    expect(usagePoints.map(point => point.blobs?.[1])).toContain(
      'https://chatgpt.com/oauth/callback-1/client.json',
    )
    expect(usagePoints.some(point => String(point.blobs?.[0] ?? '').length > 0 && point.blobs?.[1] === '')).toBe(true)
    expect(await env.DB.prepare('SELECT count(*) AS n FROM usage_events').first('n')).toBe(0)
  })
  it('attributes calls to an opaque dynamically registered client', async () => {
    oauthToken(['memory:read'], 'client_2vB7qLmN4pQr')
    const response = await mcp(
      request('/mcp', 'oauth-token', jsonRpc(1, 'tools/call', {
        name: 'memory_search',
        arguments: { query: 'sqlc' },
      })),
      env,
    )
    expect(response.status).toBe(200)
    expect(usagePoints.map(point => point.blobs?.[1])).toContain('client_2vB7qLmN4pQr')
  })
})
