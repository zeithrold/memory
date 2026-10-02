import type { Principal } from '../lib/contracts'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { createMemory } from '../lib/server/memories'
import { jwtVerify } from './access-mock'
import { api } from './api'
import { database } from './database'

const MASTER_KEY = 'e'.repeat(64)

const session: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: [
    'memory:read',
    'memory:write',
    'memory:delete',
  ],
  project: null,
}

let env: Env

let store: ReturnType<typeof database>

let createRun: ReturnType<typeof vi.fn<(options: WorkflowInstanceCreateOptions<unknown>) => Promise<{ id: string }>>>

beforeEach(() => {
  store = database()
  createRun = vi.fn(async (_options: WorkflowInstanceCreateOptions<unknown>) => await Promise.resolve({
    id: 'instance',
  }))
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    AGENT_SETTINGS_KEY: MASTER_KEY,
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ACCESS_AUD: 'access-aud-tag',
    CATALOG_WORKFLOW: { create: createRun },
  }
  jwtVerify.mockReset()
  jwtVerify.mockResolvedValue({ payload: { sub: 'alice' } })
})

afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

async function call(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ status: number, body: Record<string, unknown> | null }> {
  const response = await api(
    new Request(`https://memory.example${path}`, {
      method,
      headers: {
        'Cf-Access-Jwt-Assertion': 'access.jwt',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  )
  const text = await response.text()
  return {
    status: response.status,
    body: text.length === 0 ? null : z.record(z.string(), z.unknown()).parse(JSON.parse(text)),
  }
}

async function configure(extra: Record<string, unknown> = {}): Promise<{
  status: number
  body: Record<string, unknown> | null
}> {
  return await call('/api/v1/catalog/settings', 'PUT', {
    provider: 'responses-api',
    baseUrl: 'https://api.example.com',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-live-0123456789abcdef',
    enabled: true,
    ...extra,
  })
}

type MemoryResult = Promise<{
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

async function memory(
  title: string,
  content = 'Some durable content.',
): MemoryResult {
  return await createMemory(env, session, {
    project: 'global',
    title,
    content,
    kind: 'fact',
    tags: [],
    source: 'Recorded for a catalog test.',
    idempotencyKey: crypto.randomUUID(),
  })
}

async function category(slug: string, label: string): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', NULL, ?, ?, 'Related entries.', 'NOT here: anything else.', 1,
0, 'active', 'user', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(id, slug, label)
    .run()
  return id
}

async function assign(
  memoryId: string,
  categoryId: string,
  isPrimary = 1,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
     VALUES ('alice', ?, ?, ?, 0.9, 'agent', 1, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(
      memoryId,
      categoryId,
      isPrimary,
    )
    .run()
}

async function openRun(mode = 'live', status = 'succeeded'): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at, finished_at)
     VALUES (?, 'alice', 'manual', ?, ?, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:01.000Z')`,
  )
    .bind(id, mode, status)
    .run()
  return id
}
export { assign, call, category, configure, jwtVerify, MASTER_KEY, memory, openRun, session }

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
  get createRun(): ReturnType<typeof vi.fn<(options: WorkflowInstanceCreateOptions<unknown>) => Promise<{
    id: string
  }>>> {
    return createRun
  },
  set createRun(value: ReturnType<typeof vi.fn<(options: WorkflowInstanceCreateOptions<unknown>) => Promise<{
    id: string
  }>>>) {
    createRun = value
  },
}
