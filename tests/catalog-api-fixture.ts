import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { digest, randomToken } from '../lib/server/crypto'
import { jwtVerify } from './access-mock'
import { api } from './api'
import { database } from './database'

// `authenticate` resolves a browser session through Cloudflare Access; the
// service layer is exercised for real behind it.

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
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ACCESS_AUD: 'access-aud-tag',
  }
  jwtVerify.mockReset()
  jwtVerify.mockResolvedValue({ payload: { sub: 'alice' } })
  token = randomToken()
  await env.DB.prepare(
    ('INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, '
      + 'created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  )
    .bind(
      crypto.randomUUID(),
      'alice',
      'Test',
      await digest(token),
      token.slice(0, 12),
      JSON.stringify([
        'memory:read',
        'memory:write',
        'memory:delete',
      ]),
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  if (credential === 'session') {
    headers['Cf-Access-Jwt-Assertion'] = 'access.jwt'
  }
  else {
    headers.Authorization = `Bearer ${token}`
  }
  return new Request(`https://memory.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  credential = 'session',
): Promise<{ status: number, text: string, body: Record<string, unknown> | null }> {
  const response = await api(request(path, method, body, credential), env)
  const text = await response.text()
  return {
    status: response.status,
    text,
    body: text.length === 0 ? null : z.record(z.string(), z.unknown()).parse(JSON.parse(text)),
  }
}

/** A connected endpoint that answers with a tool call. */
function stubProvider(): void {
  vi.stubGlobal('fetch', vi.fn(async () =>
    await Promise.resolve(new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          { type: 'function_call', call_id: 'c', name: 'ping', arguments: '{"ok":true}' },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))))
}
export { call, jwtVerify, MASTER_KEY, request, stubProvider }

export const fixture = {
  get env(): Env {
    return env
  },
  set env(value: Env) {
    env = value
  },
  get store(): ReturnType<typeof database> {
    return store
  },
  set store(value: ReturnType<typeof database>) {
    store = value
  },
  get token(): string {
    return token
  },
  set token(value: string) {
    token = value
  },
}
