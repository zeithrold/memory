import type { Mock } from 'vitest'
import type { Principal } from '../lib/contracts'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, vi } from 'vitest'
import { digest, randomToken } from '../lib/server/crypto'
import {
  createMemory,
} from '../lib/server/memories'
import { database } from './database'

const alice: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: [
    'memory:read',
    'memory:write',
    'memory:delete',
  ],
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
        if (point !== undefined) {
          usagePoints.push(point)
        }
      },
    },
  }
})

afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

type CreateResult = Promise<{
  project: string
  title: string
  content: string
  kind: 'fact' | 'preference' | 'decision' | 'experience'
  tags: string[]
  source: string
  id: string
  version: number
  createdAt: string
  updatedAt: string
}>

async function create(): CreateResult {
  return await createMemory(env, alice, {
    ...input,
    idempotencyKey: crypto.randomUUID(),
  })
}

async function token(
  ownerId = 'alice',
  scopes = [
    'memory:read',
    'memory:write',
    'memory:delete',
  ],
  project: string | null = null,
): Promise<{ secret: string, id: string }> {
  const secret = randomToken()
  const id = crypto.randomUUID()
  await env.DB.prepare(
    ('INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, '
      + 'created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
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

function request(
  path: string,
  secret: string,
  method = 'GET',
  body?: unknown,
): Request<unknown, CfProperties<unknown>> {
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

type VectorsResult = {
  query: Mock<(...args: unknown[]) => Promise<unknown>>
  upsert: Mock<(...args: unknown[]) => Promise<unknown>>
  deleteByIds: Mock<(...args: unknown[]) => Promise<unknown>>
}

function vectors(matches: VectorizeMatch[] = []): VectorsResult {
  const query = vi.fn().mockResolvedValue({ count: matches.length, matches })
  const upsert = vi.fn().mockResolvedValue({ mutationId: 'test' })
  const deleteByIds = vi.fn().mockResolvedValue({ mutationId: 'test' })
  env.VECTORIZE = { query, upsert, deleteByIds }
  env.AI = {
    run: vi
      .fn()
      .mockResolvedValue({ data: [
        Array.from({ length: 1024 }).fill(0.1),
      ] }),
  }
  return { query, upsert, deleteByIds }
}
export { alice, bob, create, input, request, token, vectors }

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
