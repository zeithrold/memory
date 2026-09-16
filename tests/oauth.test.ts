import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const { authenticateRequest } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}))
vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ authenticateRequest }),
  verifyToken: vi.fn().mockRejectedValue(new Error('not a session token')),
}))

// Decodes to https://unique-gelding-15.clerk.accounts.dev
const PUBLISHABLE_KEY
  = 'pk_test_dW5pcXVlLWdlbGRpbmctMTUuY2xlcmsuYWNjb3VudHMuZGV2JA=='
const publishedKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

let env: Env
let store: ReturnType<typeof database>
beforeEach(() => {
  store = database()
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    CLERK_SECRET_KEY: 'sk_test_placeholder',
    CLERK_ISSUER: 'https://clerk.example',
  }
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  authenticateRequest.mockReset()
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
      'memory_get',
    ])
    expect(body.result.tools[0]?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['memory:read'] },
    ])
    expect(Object.keys(body.result.tools[0]?.inputSchema.properties ?? {})).toContain(
      'query',
    )
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
    const attributed = await env.DB.prepare(
      'SELECT client_id FROM usage_events WHERE client_id IS NOT NULL',
    ).all<{ client_id: string }>()
    expect(attributed.results).toEqual([
      { client_id: 'https://chatgpt.com/oauth/callback-1/client.json' },
    ])
    const keyed = await env.DB.prepare(
      'SELECT count(*) AS n FROM usage_events WHERE token_id IS NOT NULL AND client_id IS NULL',
    ).first('n')
    expect(keyed).toBe(1)
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
    expect(
      await env.DB.prepare(
        'SELECT client_id FROM usage_events WHERE client_id IS NOT NULL',
      ).first('client_id'),
    ).toBe('client_2vB7qLmN4pQr')
  })
})
