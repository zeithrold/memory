import type { Principal } from '../lib/contracts'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach } from 'vitest'
import { createMemory } from '../lib/server/memories'
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

const QUERY = 'database access'

let env: Env

let store: ReturnType<typeof database>

beforeEach(() => {
  store = database()
  env = { DB: store.db, APP_ORIGIN: 'https://memory.example' }
})

afterEach(() => {
  store.sqlite.close()
})

async function category(
  slug: string,
  label: string,
  description: string,
  boundary: string,
): Promise<string> {
  const id = crypto.randomUUID()
  const now = '2026-09-16T00:00:00.000Z'
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', NULL, ?, ?, ?, ?, 1, 0, 'active', 'user', ?, ?)`,
  )
    .bind(id, slug, label, description, boundary, now, now)
    .run()
  return id
}

async function childCategory(
  parentId: string,
  slug: string,
  options: { label: string, description: string, boundary: string },
): Promise<string> {
  const { label, description, boundary } = options

  const id = crypto.randomUUID()
  const now = '2026-09-16T00:00:00.000Z'
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', ?, ?, ?, ?, ?, 2, 0, 'active', 'user', ?, ?)`,
  )
    .bind(id, parentId, slug, label, description, boundary, now, now)
    .run()
  return id
}

async function assign(
  memoryId: string,
  categoryId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
     VALUES ('alice', ?, ?, 1, 0.9, 'agent', 1, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(
      memoryId,
      categoryId,
    )
    .run()
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
  content: string,
  tags: string[] = [],
  project = 'global',
): MemoryResult {
  return await createMemory(env, alice, {
    project,
    title,
    content,
    kind: 'fact',
    tags,
    source: 'Seeded for a retrieval test.',
    idempotencyKey: crypto.randomUUID(),
  })
}

/**
 * A library shaped like the problem the catalog exists to solve: one large
 * category whose entries match the query well enough to fill the whole result
 * page, and one small, genuinely relevant category that pure ranking starves.
 */
async function starvedLibrary(): Promise<{ infra: string, compliance: string, starved: string, buried: string[] }> {
  const infra = await category(
    'infra',
    'Infrastructure',
    'Database access, drivers and servers.',
    'NOT here: retention rules.',
  )
  const compliance = await category(
    'compliance',
    'Compliance',
    'Rules about database retention and audit.',
    'NOT here: infrastructure.',
  )
  const buried: string[] = []
  for (let index = 0; index < 12; index++) {
    const created = await memory(
      `Database access policy ${index}`,
      `Database access goes through the approved driver, revision ${index}.`,
    )
    await assign(created.id, infra)
    buried.push(created.id)
  }
  const starved = await memory(
    'Retention rule',
    'Records describing database usage are kept for seven years.',
  )
  await assign(starved.id, compliance)
  return { infra, compliance, starved: starved.id, buried }
}
export { alice, assign, category, childCategory, memory, QUERY, starvedLibrary }

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
}
