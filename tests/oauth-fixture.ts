import type { Env } from '../lib/server/env'
import process from 'node:process'
import { afterEach, beforeEach, vi } from 'vitest'
import { digest, randomToken } from '../lib/server/crypto'
import {
  resetAccessJwksCache,
} from '../lib/server/oauth'
import { jwtVerify } from './access-mock'
import { database } from './database'

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
        if (point !== undefined) {
          usagePoints.push(point)
        }
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
  if (publishedTeam === undefined) {
    delete process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN
  }
  else {
    process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN = publishedTeam
  }
})

async function token(
  scopes = ['memory:read', 'memory:write'],
  ownerId = 'alice',
): Promise<string> {
  const secret = randomToken()
  await env.DB.prepare(
    ('INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, '
      + 'created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
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

type RequestOptions = {
  secret?: string
  accessJwt?: string
  cookie?: string
  body?: unknown
}

function request(
  path: string,
  options: RequestOptions = {},
): Request<unknown, CfProperties<unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (options.secret !== undefined) {
    headers.Authorization = `Bearer ${options.secret}`
  }
  if (options.accessJwt !== undefined) {
    headers['Cf-Access-Jwt-Assertion'] = options.accessJwt
  }
  if (options.cookie !== undefined) {
    headers.Cookie = options.cookie
  }
  return new Request(`https://memory.example${path}`, {
    method: options.body === undefined ? 'GET' : 'POST',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}

function jsonRpc(
  id: number,
  method: string,
  params: unknown = {},
): { jsonrpc: string, id: number, method: string, params: unknown } {
  return { jsonrpc: '2.0', id, method, params }
}

function accessToken(sub = 'alice'): void {
  jwtVerify.mockResolvedValue({ payload: { sub, aud: AUD, iss: TEAM } })
}
export { accessToken, AUD, jsonRpc, jwtVerify, publishedTeam, request, TEAM, token }

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
  get usagePoints(): AnalyticsEngineDataPoint[] {
    return usagePoints
  },
  set usagePoints(value: AnalyticsEngineDataPoint[]) {
    usagePoints = value
  },
}
