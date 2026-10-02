import { expect, it, vi } from 'vitest'
import * as status from '../app/api/v1/status/route'
import { authenticate } from '../lib/server/auth'
import { protectedResourceResponse } from '../lib/server/discovery'
import { mcp } from '../lib/server/mcp'
import {
  accessIssuer,
  accessPrincipal,
  challenge,
  protectedResourceMetadata,
  resourceMetadataUrl,
} from '../lib/server/oauth'
import { accessToken, AUD, fixture, jsonRpc, jwtVerify, request, TEAM, token } from './oauth-fixture'

it('access issuer resolution > prefers the Worker env and trims a trailing slash', () => {
  expect(accessIssuer(fixture.env)).toBe(TEAM)
  expect(accessIssuer({ ACCESS_TEAM_DOMAIN: `${TEAM}/` })).toBe(TEAM)
})

it('access issuer resolution > falls back to the public build-time domain', () => {
  process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN = TEAM
  expect(accessIssuer({ ACCESS_TEAM_DOMAIN: undefined })).toBe(TEAM)
  delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
  expect(accessIssuer({ ACCESS_TEAM_DOMAIN: undefined })).toBeNull()
})

it(
  'protected resource metadata > describes the resource, the Access authorization server and the memory scopes',
  () => {
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
    expect(protectedResourceMetadata(fixture.env, 'https://memory.example')).toEqual({
      resource: 'https://memory.example',
      authorization_servers: [TEAM],
      scopes_supported: [
        'memory:read',
        'memory:write',
        'memory:delete',
      ],
      bearer_methods_supported: ['header'],
    })
    expect(resourceMetadataUrl(fixture.env)).toBe(
      'https://memory.example/.well-known/oauth-protected-resource',
    )
    expect(
      protectedResourceMetadata(
        { ...fixture.env, ACCESS_TEAM_DOMAIN: undefined },
        'https://memory.example',
      ),
    ).toBeNull()
  },
)

it(
  'protected resource metadata > serves the document publicly and fails closed without Access',
  async () => {
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
    const configured = protectedResourceResponse(
      new Request(resourceMetadataUrl(fixture.env)),
      fixture.env,
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
      new Request(`${resourceMetadataUrl(fixture.env)}/mcp`),
      fixture.env,
      '/mcp',
    )
    expect(await scoped.json()).toMatchObject({ resource: 'https://memory.example/mcp' })
    const missing = protectedResourceResponse(
      new Request(resourceMetadataUrl(fixture.env)),
      { ...fixture.env, ACCESS_TEAM_DOMAIN: undefined },
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
      new Request(resourceMetadataUrl(fixture.env), { method: 'OPTIONS' }),
      fixture.env,
      '',
    )
    expect(preflight.status).toBe(204)
  },
)

it(
  'access principal and challenge > grants the full memory scope set to an Access identity',
  () => {
    expect(accessPrincipal('user_1')).toEqual({
      ownerId: 'user_1',
      tokenId: null,
      scopes: [
        'memory:read',
        'memory:write',
        'memory:delete',
      ],
      project: null,
    })
  },
)

it('access principal and challenge > builds an actionable challenge', () => {
  const header = challenge(fixture.env, {
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

it('access credentials > verifies a Cf-Access-Jwt-Assertion for MCP', async () => {
  accessToken('alice')
  const principal = await authenticate(
    request('/mcp', { accessJwt: 'access.jwt' }),
    fixture.env,
    ['personal', 'oauth'],
  )
  expect(principal).toMatchObject({
    ownerId: 'alice',
    tokenId: null,
    scopes: [
      'memory:read',
      'memory:write',
      'memory:delete',
    ],
  })
  expect(jwtVerify).toHaveBeenCalled()
})

it(
  'access credentials > accepts the CF_Authorization cookie as a session credential',
  async () => {
    accessToken('alice')
    const principal = await authenticate(
      request('/api/v1/memories', {
        cookie: 'CF_Authorization=access.jwt',
      }),
      fixture.env,
      ['session', 'personal'],
    )
    expect(principal.ownerId).toBe('alice')
  },
)

it(
  'access credentials > reports a thrown verification failure as 401, never as a server error',
  async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    jwtVerify.mockRejectedValue(new Error('signature verification failed'))
    await expect(
      authenticate(
        request('/mcp', { accessJwt: 'garbage' }),
        fixture.env,
        ['personal', 'oauth'],
      ),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    const response = await mcp(
      request('/mcp', { accessJwt: 'garbage', body: jsonRpc(1, 'initialize') }),
      fixture.env,
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
    logged.mockRestore()
  },
)

it(
  'access credentials > rejects a service-token assertion with an empty subject',
  async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: '', aud: AUD, iss: TEAM } })
    await expect(
      authenticate(
        request('/mcp', { accessJwt: 'service' }),
        fixture.env,
        ['personal', 'oauth'],
      ),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  },
)

it(
  'access credentials > fails closed when Access is presented without configuration',
  async () => {
    await expect(
      authenticate(
        request('/mcp', { accessJwt: 'access.jwt' }),
        { ...fixture.env, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined },
        ['personal', 'oauth'],
      ),
    ).rejects.toMatchObject({ status: 503, code: 'AUTH_NOT_CONFIGURED' })
    expect(jwtVerify).not.toHaveBeenCalled()
  },
)

it('access credentials > accepts an Access JWT for credential preflight', async () => {
  accessToken('alice')
  const response = await status.GET(
    request('/api/v1/status', { accessJwt: 'access.jwt' }),
    { env: fixture.env, params: Promise.resolve({}) },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    endpoint: 'https://memory.example',
    mcpUrl: 'https://memory.example/mcp',
    credential: {
      ready: true,
      scopes: [
        'memory:read',
        'memory:write',
        'memory:delete',
      ],
      missingScopes: [],
      project: null,
    },
  })
})

it(
  'access credentials > does not treat a bare Bearer value as an Access session',
  async () => {
    accessToken('alice')
    await expect(
      authenticate(request('/api/v1/memories', { secret: 'not-a-mem-token' }), fixture.env),
    ).rejects.toMatchObject({ status: 401 })
    expect(jwtVerify).not.toHaveBeenCalled()
  },
)

it(
  'access credentials > rejects personal tokens on endpoints that do not accept them',
  async () => {
    const secret = await token()
    await expect(
      authenticate(request('/mcp', { secret }), fixture.env, ['oauth']),
    ).rejects.toMatchObject({ status: 401 })
  },
)

it(
  'mcp oauth surface > challenges an unauthenticated request with the resource metadata',
  async () => {
    const response = await mcp(request('/mcp', { body: jsonRpc(1, 'tools/list') }), fixture.env)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://memory.example/.well-known/oauth-protected-resource"',
    )
  },
)

it(
  'mcp oauth surface > serves a client that announces a newer protocol revision than the SDK supports',
  async () => {
    const key = await token()
    const newer = (method: string, params: unknown = {}) => {
      const base = request('/mcp', { secret: key, body: jsonRpc(1, method, params) })
      base.headers.set('mcp-protocol-version', '2026-07-28')
      return base
    }
    const discover = await mcp(newer('server/discover'), fixture.env)
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
      fixture.env,
    )
    expect(initialize.status).toBe(200)
    expect(await initialize.json()).toMatchObject({
      result: { protocolVersion: '2025-11-25', serverInfo: { name: 'shared-memory' } },
    })
    const listed = await mcp(newer('tools/list'), fixture.env)
    expect(listed.status).toBe(200)
    expect(JSON.stringify(await listed.json())).toContain('memory_search')
  },
)
