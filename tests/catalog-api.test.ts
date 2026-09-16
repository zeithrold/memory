import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/server/api'
import { digest, randomToken } from '../lib/server/crypto'
import { database } from './database'

// `authenticate` resolves a browser session through Clerk; the service layer is
// exercised for real behind it.
const { verifyToken } = vi.hoisted(() => ({ verifyToken: vi.fn() }))
vi.mock('@clerk/backend', () => ({
  verifyToken,
  createClerkClient: () => ({ authenticateRequest: vi.fn() }),
}))

const MASTER_KEY = 'c'.repeat(64)
let env: Env
let store: ReturnType<typeof database>
let token = ''

beforeEach(async () => {
  store = database()
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    AGENT_SETTINGS_KEY: MASTER_KEY,
    // A session credential is only attempted when Clerk is configured.
    CLERK_SECRET_KEY: 'sk_test_placeholder',
  }
  verifyToken.mockReset()
  verifyToken.mockResolvedValue({ sub: 'alice' })
  token = randomToken()
  await env.DB.prepare(
    'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      'alice',
      'Test',
      await digest(token),
      token.slice(0, 12),
      JSON.stringify(['memory:read', 'memory:write', 'memory:delete']),
      null,
      new Date().toISOString(),
      '2099-01-01T00:00:00.000Z',
    )
    .run()
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  credential = 'session',
): Request {
  return new Request(`https://memory.example${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${credential === 'session' ? 'session-jwt' : token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
async function call(path: string, method = 'GET', body?: unknown, credential = 'session') {
  const response = await api(request(path, method, body, credential), env)
  const text = await response.text()
  return { status: response.status, text, body: text.length === 0 ? null : JSON.parse(text) as Record<string, unknown> }
}
/** A connected endpoint that answers with a tool call. */
function stubProvider() {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'ping', arguments: '{"ok":true}' } }] }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
}

describe('catalog settings authorisation', () => {
  it('refuses a personal token, which must not reconfigure the account', async () => {
    const read = await call('/api/v1/catalog/settings', 'GET', undefined, 'token')
    expect(read.status).toBe(403)
    expect(read.body).toMatchObject({ code: 'SESSION_REQUIRED' })
    const write = await call('/api/v1/catalog/settings', 'PUT', { enabled: false }, 'token')
    expect(write.status).toBe(403)
    expect(write.body).toMatchObject({ code: 'SESSION_REQUIRED' })
    const probe = await call('/api/v1/catalog/settings/test', 'POST', {}, 'token')
    expect(probe.status).toBe(403)
  })
  it('starts from an unconfigured, disabled default', async () => {
    const { status, body } = await call('/api/v1/catalog/settings')
    expect(status).toBe(200)
    expect(body).toMatchObject({
      enabled: false,
      provider: 'none',
      hasApiKey: false,
      canStoreKey: true,
      intervalMinutes: 30,
      // Free-plan budgets: every turn costs two Workflow steps.
      maxBatch: 6,
      maxTurns: 2,
      maxToolCalls: 8,
      dailyTokenBudget: 100000,
    })
  })
})

describe('catalog settings validation', () => {
  it('refuses to enable without a provider, a model, or a credential', async () => {
    const none = await call('/api/v1/catalog/settings', 'PUT', { enabled: true })
    expect(none.status).toBe(400)
    expect(none.body).toMatchObject({ code: 'INVALID_INPUT' })

    const noModel = await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-live-0123456789',
      enabled: true,
    })
    expect(noModel.status).toBe(400)

    const noKey = await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'deepseek-v4-flash',
      enabled: true,
    })
    expect(noKey.status).toBe(400)
    expect(noKey.body?.detail).toContain('API key')
  })
  it('rejects an endpoint that is not HTTPS or carries a query string', async () => {
    const insecure = await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'http://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789',
    })
    expect(insecure.status).toBe(400)
    expect(insecure.body).toMatchObject({ code: 'PROVIDER_ENDPOINT_INVALID' })

    const query = await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com?key=1',
      model: 'm',
      apiKey: 'sk-live-0123456789',
    })
    expect(query.status).toBe(400)
  })
  it('fails closed when the deployment cannot encrypt a credential', async () => {
    // Clerk stays configured, so the failure is the missing master key rather
    // than an unauthenticated request.
    const bare: Env = { ...env, AGENT_SETTINGS_KEY: undefined }
    const response = await api(
      request('/api/v1/catalog/settings', 'PUT', {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.com',
        model: 'm',
        apiKey: 'sk-live-0123456789',
      }),
      bare,
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'AGENT_KEY_UNCONFIGURED' })
    // Nothing was written, so no plaintext credential is sitting in the table.
    const row = await env.DB.prepare('SELECT * FROM agent_settings').first()
    expect(row).toBeNull()
  })
  it('rejects unknown fields rather than ignoring them', async () => {
    const { status, body } = await call('/api/v1/catalog/settings', 'PUT', { nonsense: true })
    expect(status).toBe(400)
    expect(body).toMatchObject({ code: 'INVALID_INPUT' })
  })
  it('accepts only intervals on the 30-minute dispatch grid', async () => {
    const invalid = await call('/api/v1/catalog/settings', 'PUT', { intervalMinutes: 45 })
    expect(invalid.status).toBe(400)
    expect(invalid.body).toMatchObject({ code: 'INVALID_INPUT' })

    const valid = await call('/api/v1/catalog/settings', 'PUT', { intervalMinutes: 60 })
    expect(valid.status).toBe(200)
    expect(valid.body).toMatchObject({ intervalMinutes: 60 })
  })
  it('reserves two tool calls beyond the batch size', async () => {
    const invalid = await call('/api/v1/catalog/settings', 'PUT', {
      maxBatch: 7,
      maxToolCalls: 8,
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body).toMatchObject({ code: 'INVALID_INPUT' })

    const valid = await call('/api/v1/catalog/settings', 'PUT', {
      maxBatch: 6,
      maxToolCalls: 8,
      dailyTokenBudget: 120000,
    })
    expect(valid.status).toBe(200)
    expect(valid.body).toMatchObject({
      maxBatch: 6,
      maxToolCalls: 8,
      dailyTokenBudget: 120000,
    })
  })
})

describe('catalog settings storage', () => {
  it('stores ciphertext and returns only a hint', async () => {
    const saved = await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1/',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-live-0123456789abcdef',
      enabled: true,
    })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({
      enabled: true,
      provider: 'openai-compatible',
      // The trailing slash is normalised away, the path is preserved.
      baseUrl: 'https://api.example.com/v1',
      model: 'deepseek-v4-flash',
      hasApiKey: true,
      apiKeyHint: 'cdef',
    })
    expect(saved.text).not.toContain('0123456789abcdef')

    const row = await env.DB.prepare('SELECT * FROM agent_settings WHERE owner_id = ?')
      .bind('alice')
      .first<{ api_key_ciphertext: string, api_key_hint: string }>()
    expect(row?.api_key_ciphertext).not.toContain('0123456789abcdef')
    expect(row?.api_key_hint).toBe('cdef')
  })
  it('keeps the stored credential when a later update omits it', async () => {
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
      enabled: true,
    })
    const updated = await call('/api/v1/catalog/settings', 'PUT', { maxTurns: 5 })
    expect(updated.body).toMatchObject({ hasApiKey: true, apiKeyHint: 'cdef', maxTurns: 5 })
  })
  it('clears the credential on request, which disables an enabled provider', async () => {
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    const cleared = await call('/api/v1/catalog/settings', 'PUT', { clearApiKey: true })
    expect(cleared.body).toMatchObject({ hasApiKey: false, apiKeyHint: null, enabled: false })
  })
  it('scopes settings to the account that saved them', async () => {
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'workers-ai',
      model: '@cf/qwen/qwen3-30b-a3b-fp8',
    })
    verifyToken.mockResolvedValue({ sub: 'bob' })
    const bob = await call('/api/v1/catalog/settings')
    expect(bob.body).toMatchObject({ provider: 'none', model: null })
  })
})

describe('connection probe', () => {
  it('tests the values in the form without recording them', async () => {
    stubProvider()
    const { status, body } = await call('/api/v1/catalog/settings/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-live-0123456789abcdef',
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ reachable: true, modelOk: true, toolCallingOk: true })
    // Nothing was persisted, so the account's last known status is untouched.
    const row = await env.DB.prepare('SELECT * FROM agent_settings').first()
    expect(row).toBeNull()
  })
  it('reports a reachable endpoint that cannot call tools', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'no tools here' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )))
    const { body } = await call('/api/v1/catalog/settings/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'not-tool-capable',
      apiKey: 'sk-live-0123456789abcdef',
    })
    expect(body).toMatchObject({ reachable: true, modelOk: true, toolCallingOk: false })
  })
  it('records the stored configuration probe so the UI can show it', async () => {
    stubProvider()
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    const { body } = await call('/api/v1/catalog/settings/test', 'POST', {})
    expect(body).toMatchObject({ reachable: true, toolCallingOk: true })
    const settings = await call('/api/v1/catalog/settings')
    expect(settings.body).toMatchObject({ lastProbeOk: true })
    expect(settings.body?.lastProbeAt).not.toBeNull()
    // The column is `last_probe_error`; a success message in it would be a lie.
    expect(settings.body?.lastProbeError).toBeNull()
  })
  it('keeps the explanation of a failed stored probe, and clears it on the next success', async () => {
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })))
    await call('/api/v1/catalog/settings/test', 'POST', {})
    const failed = await call('/api/v1/catalog/settings')
    expect(failed.body).toMatchObject({ lastProbeOk: false })
    expect(String(failed.body?.lastProbeError)).toContain('HTTP 401')

    stubProvider()
    await call('/api/v1/catalog/settings/test', 'POST', {})
    const recovered = await call('/api/v1/catalog/settings')
    expect(recovered.body).toMatchObject({ lastProbeOk: true, lastProbeError: null })
  })
  it('reuses the stored credential when the form only changes the model', async () => {
    stubProvider()
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    const { status, body } = await call('/api/v1/catalog/settings/test', 'POST', {
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'another-model',
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ reachable: true })
    const sent = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect((sent.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-live-0123456789abcdef',
    )
  })
  it('reports an unconfigured account instead of erroring', async () => {
    const { status, body } = await call('/api/v1/catalog/settings/test', 'POST', {})
    expect(status).toBe(200)
    expect(body).toMatchObject({ reachable: false, detail: 'No model endpoint is configured.' })
  })
  it('rejects an unknown catalog route', async () => {
    const { status, body } = await call('/api/v1/catalog/nonsense')
    expect(status).toBe(404)
    expect(body).toMatchObject({ code: 'NOT_FOUND' })
  })
})
