import type { Principal } from '../lib/contracts'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allocate, deviation, scoreCategories, standardize } from '../lib/server/catalog/balance'
import { searchCatalog } from '../lib/server/catalog/search'
import { maintenance } from '../lib/server/indexer'
import { createMemory, searchMemories } from '../lib/server/memories'
import { database } from './database'

const alice: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: ['memory:read', 'memory:write', 'memory:delete'],
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

async function category(slug: string, label: string, description: string, boundary: string) {
  const id = crypto.randomUUID()
  const now = '2026-09-16T00:00:00.000Z'
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', NULL, ?, ?, ?, ?, 1, 0, 'active', 'user', ?, ?)`,
  )
    .bind(id, slug, label, description, boundary, now, now)
    .run()
  return id
}
async function childCategory(
  parentId: string,
  slug: string,
  label: string,
  description: string,
  boundary: string,
) {
  const id = crypto.randomUUID()
  const now = '2026-09-16T00:00:00.000Z'
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', ?, ?, ?, ?, ?, 2, 0, 'active', 'user', ?, ?)`,
  )
    .bind(id, parentId, slug, label, description, boundary, now, now)
    .run()
  return id
}
async function assign(memoryId: string, categoryId: string) {
  await env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
     VALUES ('alice', ?, ?, 1, 0.9, 'agent', 1, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(memoryId, categoryId)
    .run()
}
async function memory(title: string, content: string, tags: string[] = [], project = 'global') {
  return createMemory(env, alice, {
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
async function starvedLibrary() {
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

describe('balanced allocation', () => {
  it('keeps a floor of one slot and a ceiling per category', () => {
    const sizes = new Map([['big', 1000], ['small', 1]])
    const allocation = allocate('sqrt', { sizes, deviations: new Map(), total: 8 })
    // Without the floor the small category rounds to zero and loses its only
    // chance to be seen, which is the entire point of routing.
    expect(allocation.get('small')).toBeGreaterThanOrEqual(1)
    expect(allocation.get('big')).toBeLessThanOrEqual(Math.ceil((8 / 2) * 1.5))
  })
  it('orders the rules the way the literature does', () => {
    const sizes = new Map([['big', 100], ['small', 1]])
    const equal = allocate('equal', { sizes, deviations: new Map(), total: 10 })
    const sqrt = allocate('sqrt', { sizes, deviations: new Map(), total: 10 })
    // A small category whose scores are internally varied: Neyman allocation is
    // variance-optimal, so it earns more than power allocation gives it. It does
    // not beat proportional-to-size on its own, because the size factor still
    // dominates; what it beats is the floor that proportional allocation hits.
    const neyman = allocate('neyman', {
      sizes,
      deviations: new Map([['big', 0.1], ['small', 2]]),
      total: 10,
    })
    expect(equal.get('small')).toBe(equal.get('big'))
    expect(sqrt.get('big')).toBeGreaterThan(sqrt.get('small') ?? 0)
    expect(neyman.get('small')).toBeGreaterThan(sqrt.get('small') ?? 0)
  })
  it('standardizes without letting an outlier set the scale', () => {
    const out = standardize([1, 2, 3, 1000])
    expect(out).toHaveLength(4)
    expect(out[3]).toBeGreaterThan(1)
    expect(out[0]).toBeLessThan(0)
    expect(deviation([])).toBe(0)
    expect(standardize([5, 5, 5])).toEqual([0, 0, 0])
  })
  it('scores categories by their own description text', () => {
    const scores = scoreCategories(
      [
        { id: 'a', label: 'Infrastructure', description: 'Database access and drivers.', boundary: 'x', member_count: 10 },
        { id: 'b', label: 'Compliance', description: 'Database retention.', boundary: 'x', member_count: 1 },
        { id: 'c', label: 'Travel', description: 'Flights and hotels.', boundary: 'x', member_count: 3 },
      ],
      ['database', 'access'],
    )
    expect([...scores.keys()].sort()).toEqual(['a', 'b'])
    expect(scores.get('a')).toBeGreaterThan(scores.get('b') ?? 0)
  })
})

describe('catalog-routed retrieval', () => {
  it('surfaces a starved category that flat ranking buries', async () => {
    const { starved, compliance } = await starvedLibrary()
    const flat = await searchMemories(env, alice, { query: QUERY, project: 'global', limit: 8 })
    expect(flat.memories.map(memory => memory.id)).not.toContain(starved)
    expect(flat.catalog).toBeNull()

    const routed = await searchMemories(env, alice, {
      query: QUERY,
      project: 'global',
      limit: 8,
      mode: 'catalog',
      balance: 'sqrt',
    })
    // The floor of one slot is what puts it back on the page.
    expect(routed.memories.map(memory => memory.id)).toContain(starved)
    expect(routed.catalog).toMatchObject({ routed: true, balance: 'sqrt' })
    const labels = routed.catalog?.categories.map(entry => entry.id) ?? []
    expect(labels).toContain(compliance)
    // The large category still fills the rest: routing narrows the budget, it
    // does not replace ranking.
    expect(routed.memories.length).toBe(8)
  })

  it('always fuses the flat ranking, so a routing miss costs ranking quality but never recall', async () => {
    const { buried } = await starvedLibrary()
    const flat = await searchMemories(env, alice, { query: QUERY, project: 'global', limit: 5 })
    const routed = await searchMemories(env, alice, {
      query: QUERY,
      project: 'global',
      limit: 5,
      mode: 'catalog',
      balance: 'sqrt',
    })
    // Everything flat found is still reachable after routing.
    for (const id of flat.memories.map(memory => memory.id))
      expect(routed.memories.map(memory => memory.id)).toContain(id)
    expect(routed.memories.map(memory => memory.id).sort()).toEqual(
      expect.arrayContaining(buried.slice(0, 3).sort()),
    )
  })

  it('reports a routing miss instead of pretending to route', async () => {
    await starvedLibrary()
    const result = await searchMemories(env, alice, {
      query: 'invoice reimbursement',
      project: 'global',
      limit: 5,
      mode: 'catalog',
    })
    expect(result.catalog).toEqual({ routed: false, balance: 'sqrt', categories: [] })
    const flat = await searchMemories(env, alice, {
      query: 'invoice reimbursement',
      project: 'global',
      limit: 5,
    })
    expect(result.memories).toEqual(flat.memories)
  })

  it('leaves an empty catalog alone', async () => {
    const result = await searchMemories(env, alice, {
      query: QUERY,
      project: 'global',
      limit: 5,
      mode: 'catalog',
    })
    expect(result.catalog).toEqual({ routed: false, balance: 'sqrt', categories: [] })
    expect(result.memories).toEqual([])
  })

  it('keeps every balance rule on the page when one is starved', async () => {
    const { starved } = await starvedLibrary()
    for (const balance of ['equal', 'sqrt', 'neyman'] as const) {
      const result = await searchMemories(env, alice, {
        query: QUERY,
        project: 'global',
        limit: 8,
        mode: 'catalog',
        balance,
      })
      expect(result.memories.map(memory => memory.id), balance).toContain(starved)
    }
  })

  it('honours an explicit category scope returned by catalog search', async () => {
    const { compliance, starved } = await starvedLibrary()
    const scoped = await searchMemories(env, alice, {
      query: QUERY,
      project: 'global',
      categoryIds: [compliance],
      limit: 8,
    })
    expect(scoped.memories.map(memory => memory.id)).toEqual([starved])
  })
})

describe('catalog search', () => {
  it('returns paths and project-filtered counts without exposing empty categories', async () => {
    const root = await category(
      'engineering',
      'Engineering',
      'Software and database engineering.',
      'NOT here: travel.',
    )
    const database = await childCategory(
      root,
      'database',
      'Database',
      'Database access and storage.',
      'NOT here: application UI.',
    )
    const hidden = await category(
      'private-database',
      'Private database',
      'Database notes for another project.',
      'NOT here: global notes.',
    )
    const visibleMemory = await memory('Database driver', 'Use a database driver.')
    await assign(visibleMemory.id, database)
    const privateMemory = await memory(
      'Private database',
      'A database note in another project.',
      [],
      'private-project',
    )
    await assign(privateMemory.id, hidden)

    const result = await searchCatalog(env, alice, {
      query: 'database',
      project: 'global',
      limit: 10,
    })
    expect(result.project).toBe('global')
    expect(result.categories.map(entry => entry.id)).toEqual(
      expect.arrayContaining([root, database]),
    )
    expect(result.categories.map(entry => entry.id)).not.toContain(hidden)
    expect(result.categories.find(entry => entry.id === root)?.visibleMemberCount).toBe(1)
    expect(result.categories.find(entry => entry.id === database)?.path).toEqual([
      { id: root, slug: 'engineering', label: 'Engineering' },
      { id: database, slug: 'database', label: 'Database' },
    ])
  })

  it('enforces a project-restricted credential before searching categories', async () => {
    await expect(searchCatalog(env, { ...alice, project: 'private-project' }, {
      query: 'database',
      project: 'global',
    })).rejects.toMatchObject({ status: 403 })
  })

  it('includes descendants when memory search scopes to a root category', async () => {
    const root = await category(
      'engineering',
      'Engineering',
      'Software engineering.',
      'NOT here: travel.',
    )
    const database = await childCategory(
      root,
      'database',
      'Database',
      'Database storage.',
      'NOT here: frontend.',
    )
    const created = await memory('Database access', 'Database access uses sqlc.')
    await assign(created.id, database)
    const result = await searchMemories(env, alice, {
      query: 'database',
      categoryIds: [root],
    })
    expect(result.memories.map(memory => memory.id)).toEqual([created.id])
  })
})

/**
 * The benchmark gate the plan requires before catalog routing could become the
 * default. It scores recall against a set of memories the fixture declares
 * relevant; the assertion is deliberately directional rather than absolute,
 * because the fixture is synthetic and a real multilingual set does not exist
 * yet. When one does, this is where it goes.
 */
describe('retrieval benchmark: flat versus catalog routing', () => {
  it('does not lose recall on the starved fixture', async () => {
    const { starved } = await starvedLibrary()
    const relevant = new Set([starved])
    const report: Record<string, number> = {}
    for (const mode of ['flat', 'catalog'] as const) {
      const result = await searchMemories(env, alice, {
        query: QUERY,
        project: 'global',
        limit: 8,
        mode,
        balance: 'sqrt',
      })
      const found = result.memories.filter(memory => relevant.has(memory.id)).length
      report[mode] = found / relevant.size
    }
    // Printed so a run of the suite reports the number a reviewer would ask for.
    process.stdout.write(`recall@8 starved-category fixture: ${JSON.stringify(report)}\n`)
    expect(report.catalog).toBeGreaterThanOrEqual(report.flat ?? 0)
    expect(report.catalog).toBe(1)
  })
})

describe('audit retention', () => {
  it('prunes finished runs but never a live one, whose rows are its journal', async () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString()
    const live = crypto.randomUUID()
    const done = crypto.randomUUID()
    for (const [id, status] of [[live, 'running'], [done, 'succeeded']] as const) {
      await env.DB.prepare(
        `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at, finished_at) VALUES (?, 'alice', 'manual', 'live', ?, ?, ?)`,
      ).bind(id, status, old, old).run()
      await env.DB.prepare(
        `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, created_at) VALUES (?, 'alice', 0, 0, 'x', ?)`,
      ).bind(id, old).run()
      await env.DB.prepare(
        `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, arguments_json, decision, created_at)
         VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', '{}', 'applied', ?)`,
      ).bind(id, old).run()
    }
    await maintenance(env)
    const actions = await env.DB.prepare('SELECT run_id FROM catalog_actions')
      .all<{ run_id: string }>()
    // A retried step finds its own journal row; deleting it mid-run would let
    // the same effect land twice.
    expect(actions.results.map(row => row.run_id)).toEqual([live])
    const turns = await env.DB.prepare('SELECT run_id FROM catalog_turns').all<{ run_id: string }>()
    expect(turns.results.map(row => row.run_id)).toEqual([live])
  })
})
