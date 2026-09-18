import type { Principal } from '../lib/contracts'
import type { getRunDetail } from '../lib/server/catalog/query'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectBatch } from '../lib/server/catalog/model'
import { listProposals, revertRun } from '../lib/server/catalog/query'
import { dispatchCatalogWorkflow, finishRun } from '../lib/server/catalog/run'
import { createMemory, moveMemoryProject } from '../lib/server/memories'
import { api } from './api'
import { database } from './database'

const { jwtVerify } = vi.hoisted(() => ({ jwtVerify: vi.fn() }))
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    // eslint-disable-next-line ts/promise-function-async -- vi.fn already returns a Promise
    jwtVerify: (...args: unknown[]) => jwtVerify(...args) as ReturnType<typeof actual.jwtVerify>,
    createRemoteJWKSet: () => (() => {}) as ReturnType<typeof actual.createRemoteJWKSet>,
  }
})

const MASTER_KEY = 'e'.repeat(64)
const session: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: ['memory:read', 'memory:write', 'memory:delete'],
  project: null,
}
let env: Env
let store: ReturnType<typeof database>
let createRun: ReturnType<typeof vi.fn>

beforeEach(() => {
  store = database()
  createRun = vi.fn(async () => ({ id: 'instance' }))
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    AGENT_SETTINGS_KEY: MASTER_KEY,
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ACCESS_AUD: 'access-aud-tag',
    CATALOG_WORKFLOW: { create: createRun } as unknown as Workflow<unknown>,
  }
  jwtVerify.mockReset()
  jwtVerify.mockResolvedValue({ payload: { sub: 'alice' } })
})
afterEach(() => {
  store.sqlite.close()
  vi.restoreAllMocks()
})

async function call(path: string, method = 'GET', body?: unknown) {
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
  return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) as Record<string, unknown> }
}
async function configure(extra: Record<string, unknown> = {}) {
  return call('/api/v1/catalog/settings', 'PUT', {
    provider: 'responses-api',
    baseUrl: 'https://api.example.com',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-live-0123456789abcdef',
    enabled: true,
    ...extra,
  })
}
async function memory(title: string, content = 'Some durable content.') {
  return createMemory(env, session, {
    project: 'global',
    title,
    content,
    kind: 'fact',
    tags: [],
    source: 'Recorded for a catalog test.',
    idempotencyKey: crypto.randomUUID(),
  })
}
async function category(slug: string, label: string) {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, member_count, state, created_by, created_at, updated_at)
     VALUES (?, 'alice', NULL, ?, ?, 'Related entries.', 'NOT here: anything else.', 1, 0, 'active', 'user', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(id, slug, label)
    .run()
  return id
}
async function assign(memoryId: string, categoryId: string, isPrimary = 1) {
  await env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
     VALUES ('alice', ?, ?, ?, 0.9, 'agent', 1, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(memoryId, categoryId, isPrimary)
    .run()
}
async function openRun(mode = 'live', status = 'succeeded') {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at, finished_at)
     VALUES (?, 'alice', 'manual', ?, ?, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:01.000Z')`,
  )
    .bind(id, mode, status)
    .run()
  return id
}

describe('starting a run', () => {
  it('creates the run row, starts the instance and reports the identifier', async () => {
    await configure()
    const { status, body } = await call('/api/v1/catalog/runs', 'POST', {})
    expect(status).toBe(202)
    expect(body).toMatchObject({ status: 'queued', mode: 'live' })
    expect(createRun).toHaveBeenCalledOnce()
    const params = createRun.mock.calls[0]?.[0] as { id: string, params: { ownerId: string, runId: string } }
    expect(params.params.ownerId).toBe('alice')
    // The instance and the audit row share one identifier.
    expect(params.id).toBe(params.params.runId)
    expect(params.id).toBe(body?.runId)
    const row = await env.DB.prepare('SELECT status, trigger FROM catalog_runs WHERE id = ?')
      .bind(params.id)
      .first<{ status: string, trigger: string }>()
    expect(row).toEqual({ status: 'running', trigger: 'manual' })
  })
  it('honours a dry run and fails closed without a Workflow binding', async () => {
    await configure()
    const dry = await call('/api/v1/catalog/runs', 'POST', { dryRun: true })
    expect(dry.body).toMatchObject({ mode: 'dry_run' })

    const bare: Env = { ...env, CATALOG_WORKFLOW: undefined }
    const response = await api(
      new Request('https://memory.example/api/v1/catalog/runs', {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': 'access.jwt', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      bare,
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CATALOG_DISABLED' })
  })
  it('refuses a second run while one is in flight', async () => {
    await configure()
    await call('/api/v1/catalog/runs', 'POST', {})
    const second = await call('/api/v1/catalog/runs', 'POST', {})
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: 'RUN_IN_PROGRESS' })
  })
  it('refuses to start when the account has no provider', async () => {
    const { status, body } = await call('/api/v1/catalog/runs', 'POST', {})
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
  })
})

describe('the catalog view and run timeline', () => {
  it('returns both levels of the catalog', async () => {
    const root = await category('backend', 'Backend')
    await env.DB.prepare(
      `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, member_count, state, created_by, created_at, updated_at)
       VALUES (?, 'alice', ?, 'databases', 'Databases', 'Database choices.', 'NOT here: application code.', 2, 0, 'active', 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(crypto.randomUUID(), root)
      .run()
    const { status, body } = await call('/api/v1/catalog')
    expect(status).toBe(200)
    const categories = body?.categories as { slug: string, parentId: string | null, depth: number }[]
    expect(categories.map(entry => [entry.slug, entry.depth])).toEqual([['backend', 1], ['databases', 2]])
    expect(categories[1]?.parentId).toBe(root)
    expect(body).toMatchObject({ orphans: 0, pendingProposals: 0, pendingAdvice: null })
    expect(categories[0]).toMatchObject({
      axisHint: null,
      boundary: 'NOT here: anything else.',
      description: 'Related entries.',
    })
  })
  it('pages category members and lists direct children', async () => {
    const root = await category('backend', 'Backend')
    const childId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, member_count, state, created_by, created_at, updated_at)
       VALUES (?, 'alice', ?, 'databases', 'Databases', 'Database choices.', 'NOT here: application code.', 2, 0, 'active', 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(childId, root)
      .run()
    const first = await memory('Primary memory')
    const second = await memory('Secondary memory')
    await assign(first.id, root)
    await assign(second.id, root, 0)
    await assign(second.id, childId)

    const page = await call(`/api/v1/catalog/categories/${root}?offset=0`)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({
      category: { id: root, label: 'Backend' },
      total: 2,
      offset: 0,
    })
    const children = page.body?.children as { id: string }[]
    expect(children.map(child => child.id)).toEqual([childId])
    const memories = page.body?.memories as { id: string, isPrimary: boolean }[]
    expect(memories.map(entry => entry.id)).toEqual([first.id, second.id])
    expect(memories[0]?.isPrimary).toBe(true)

    const childPage = await call(`/api/v1/catalog/categories/${childId}`)
    expect((childPage.body?.memories as { id: string }[]).map(entry => entry.id)).toEqual([second.id])
  })
  it('pages runs and run steps, and keeps operator prompts off the Workflow params', async () => {
    await configure()
    await env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, pending_advice) VALUES ('alice', 1, 'Prefer fewer top-level categories.')
       ON CONFLICT(owner_id) DO UPDATE SET pending_advice = excluded.pending_advice`,
    ).run()
    const { status, body } = await call('/api/v1/catalog/runs', 'POST', {
      prompt: 'Focus on backend memories.',
    })
    expect(status).toBe(202)
    const params = createRun.mock.calls[0]?.[0] as { params: Record<string, unknown> }
    expect(params.params).not.toHaveProperty('prompt')
    expect(params.params).not.toHaveProperty('operatorPrompt')
    const runId = body?.runId as string
    const stored = await env.DB.prepare(
      'SELECT operator_prompt FROM catalog_runs WHERE id = ?',
    )
      .bind(runId)
      .first<{ operator_prompt: string }>()
    expect(stored?.operator_prompt).toContain('Focus on backend memories.')
    expect(stored?.operator_prompt).toContain('Prefer fewer top-level categories.')
    expect(
      await env.DB.prepare('SELECT pending_advice FROM catalog_state WHERE owner_id = \'alice\'')
        .first('pending_advice'),
    ).toBeNull()

    const listed = await call('/api/v1/catalog/runs?limit=1&offset=0')
    expect(listed.body).toMatchObject({ total: 1, offset: 0, limit: 1 })
    expect((listed.body?.runs as unknown[]).length).toBe(1)

    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, arguments_json, decision, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'finish', 'finish', 'control', '{}', 'applied', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId)
      .run()
    const detail = await call(`/api/v1/catalog/runs/${runId}?limit=1&offset=0`)
    expect(detail.status).toBe(200)
    expect(detail.body?.totalActions).toBe(1)
    expect(detail.body?.offset).toBe(0)
    expect(detail.body?.limit).toBe(1)
    expect(String(detail.body?.operatorPrompt)).toContain('Focus on backend memories.')
  })
  it('replays a run turn by turn with the decision for each call', async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    await env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, tool_calls_json, tool_results_json, prompt_tokens, completion_tokens, latency_ms, created_at)
       VALUES (?, 'alice', 0, 0, 'Thinking about the batch.', '[{"id":"c1","name":"assign","arguments":{}}]', '[]', 10, 4, 900, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId)
      .run()
    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, arguments_json, rationale, decision, policy_reason, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', ?, ?, '{}', 'Go work.', 'applied', NULL, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId, mem.id, cat)
      .run()

    const { body } = await call(`/api/v1/catalog/runs/${runId}`)
    const detail = body as unknown as Awaited<ReturnType<typeof getRunDetail>>
    expect(detail.run.status).toBe('succeeded')
    expect(detail.timeline).toHaveLength(1)
    expect(detail.timeline[0]?.content).toBe('Thinking about the batch.')
    // The audit row stores identifiers, so the title is resolved at read time.
    expect(detail.timeline[0]?.actions[0]).toMatchObject({
      tool: 'assign',
      decision: 'applied',
      memoryTitle: 'Database access',
      categoryLabel: 'Backend',
    })
  })
  it('hides another account\'s run', async () => {
    const runId = await openRun()
    const { status, body } = await call(`/api/v1/catalog/runs/${runId}`)
    expect(status).toBe(200)
    jwtVerify.mockResolvedValue({ payload: { sub: 'bob' } })
    const other = await call(`/api/v1/catalog/runs/${runId}`)
    expect(other.status).toBe(404)
    expect(other.body).toMatchObject({ code: 'RUN_NOT_FOUND' })
    expect(body).not.toBeNull()
  })
})

describe('reverting a run', () => {
  it('removes an assignment the run applied', async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    await assign(mem.id, cat)
    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, arguments_json, before_json, decision, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', ?, ?, '{}', '[]', 'applied', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId, mem.id, cat)
      .run()

    const { status, body } = await call(`/api/v1/catalog/runs/${runId}/revert`, 'POST', {})
    expect(status).toBe(200)
    expect(body).toMatchObject({ reverted: 1, skipped: 0 })
    expect(await env.DB.prepare('SELECT count(*) AS n FROM memory_categories').first('n')).toBe(0)
    const run = await env.DB.prepare('SELECT status FROM catalog_runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string }>()
    expect(run?.status).toBe('reverted')
    // The reversal itself is auditable.
    const revert = await env.DB.prepare('SELECT decision, revert_of FROM catalog_actions WHERE batch = -2')
      .first<{ decision: string, revert_of: number }>()
    expect(revert?.decision).toBe('applied')
    expect(revert?.revert_of).toBeGreaterThan(0)
  })
  it('reports what it could not undo instead of claiming success', async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    // A hard delete was recorded, which has no inverse here.
    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, arguments_json, decision, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'unassign', 'unassign', 'immediate', ?, ?, '{}', 'applied', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId, mem.id, cat)
      .run()
    const result = await revertRun(env, 'alice', runId)
    expect(result).toEqual({ reverted: 0, skipped: 1 })
  })
  it('refuses to revert a run that is still going', async () => {
    const runId = await openRun('live', 'running')
    const { status, body } = await call(`/api/v1/catalog/runs/${runId}/revert`, 'POST', {})
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: 'RUN_IN_PROGRESS' })
  })
})

describe('deciding a proposal', () => {
  async function seedProposal(kind: string, payload: Record<string, unknown>, fields: Record<string, unknown> = {}) {
    const id = crypto.randomUUID()
    const runId = await openRun()
    await env.DB.prepare(
      `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id, target_category_id, memory_id, target_project, payload_json, rationale, evidence_runs, status, created_at)
       VALUES (?, 'alice', ?, ?, ?, ?, ?, ?, ?, ?, 'Because.', 2, 'pending', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        id,
        runId,
        runId,
        kind,
        fields.categoryId ?? null,
        fields.targetCategoryId ?? null,
        fields.memoryId ?? null,
        fields.targetProject ?? null,
        JSON.stringify(payload),
      )
      .run()
    return id
  }

  it('moves a memory only after the proposal is approved', async () => {
    const mem = await memory('Database access')
    const proposalId = await seedProposal(
      'project_move',
      { memoryId: mem.id, from: 'global', to: 'billing' },
      { memoryId: mem.id, targetProject: 'billing' },
    )
    // Still where it was while the proposal is merely pending.
    let row = await env.DB.prepare('SELECT project FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string, version: number }>()
    expect(row?.project).toBe('global')

    const { status, body } = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'approved' })
    row = await env.DB.prepare('SELECT project, version FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string, version: number }>()
    expect(row?.project).toBe('billing')
    expect(row?.version).toBe(2)
    // The move queued a fresh index job, so the vector follows the memory.
    const jobs = await env.DB.prepare('SELECT count(*) AS n FROM index_jobs WHERE memory_id = ?')
      .bind(mem.id)
      .first<{ n: number }>()
    expect(jobs?.n).toBeGreaterThan(1)
    // The human decision is recorded against the proposal.
    const decision = await env.DB.prepare('SELECT decision FROM catalog_actions WHERE batch = -3')
      .first<{ decision: string }>()
    expect(decision?.decision).toBe('applied')
  })
  it('records a rejection without touching anything', async () => {
    const mem = await memory('Database access')
    const proposalId = await seedProposal(
      'project_move',
      { memoryId: mem.id, from: 'global', to: 'billing' },
      { memoryId: mem.id, targetProject: 'billing' },
    )
    const { body } = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'reject' })
    expect(body).toMatchObject({ status: 'rejected' })
    const row = await env.DB.prepare('SELECT project FROM memories WHERE id = ?')
      .bind(mem.id)
      .first<{ project: string }>()
    expect(row?.project).toBe('global')
    const decision = await env.DB.prepare('SELECT decision FROM catalog_actions WHERE batch = -3')
      .first<{ decision: string }>()
    expect(decision?.decision).toBe('rejected_by_user')
  })
  it('accepts a package in create-then-merge order and stores reject advice', async () => {
    const root = await category('backend', 'Backend')
    const createId = await seedProposal('create_category', {
      parentId: root,
      slug: 'caches',
      label: 'Caches',
      description: 'Cache decisions.',
      boundary: 'NOT here: databases.',
      axisHint: null,
    })
    const tiny = await category('tiny', 'Tiny')
    await env.DB.prepare('UPDATE categories SET parent_id = ?, depth = 2 WHERE id = ?')
      .bind(root, tiny)
      .run()
    const mergeId = await seedProposal(
      'merge_category',
      { fromId: tiny, intoId: root },
      { categoryId: tiny, targetCategoryId: root },
    )

    const approved = await call('/api/v1/catalog/proposals', 'POST', {
      decision: 'approve',
      ids: [mergeId, createId],
    })
    expect(approved.status).toBe(200)
    expect(approved.body).toMatchObject({ decided: 2, failed: [] })
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS n FROM categories WHERE slug = \'caches\' AND parent_id = ?',
      ).bind(root).first('n'),
    ).toBe(1)
    expect(
      await env.DB.prepare('SELECT state FROM categories WHERE id = ?').bind(tiny).first('state'),
    ).toBe('retired')

    const leftover = await seedProposal('create_category', {
      parentId: null,
      slug: 'travel',
      label: 'Travel',
      description: 'Trips.',
      boundary: 'NOT here: work.',
      axisHint: null,
    })
    const rejected = await call('/api/v1/catalog/proposals', 'POST', {
      decision: 'reject',
      advice: 'Keep travel under life admin instead.',
    })
    expect(rejected.body).toMatchObject({ decided: 1, failed: [] })
    expect(
      await env.DB.prepare('SELECT status FROM catalog_proposals WHERE id = ?')
        .bind(leftover)
        .first('status'),
    ).toBe('rejected')
    expect(
      await env.DB.prepare('SELECT pending_advice FROM catalog_state WHERE owner_id = \'alice\'')
        .first('pending_advice'),
    ).toBe('Keep travel under life admin instead.')
  })
  it('applies an approved new category and lists pending proposals', async () => {
    const proposalId = await seedProposal('create_category', {
      parentId: null,
      slug: 'databases',
      label: 'Databases',
      description: 'Database choices.',
      boundary: 'NOT here: application code.',
      axisHint: null,
    })
    const pending = await call('/api/v1/catalog/proposals')
    expect((pending.body?.proposals as unknown[]).length).toBe(1)
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    const { body } = await call('/api/v1/catalog')
    const categories = body?.categories as { slug: string, createdBy: string }[]
    expect(categories).toEqual([expect.objectContaining({ slug: 'databases', createdBy: 'user' })])
    expect(await listProposals(env, 'alice')).toHaveLength(0)
  })
  it('clears implicit skips and refreshes counters after approving a category', async () => {
    const mem = await memory('Database access')
    await env.DB.prepare(
      `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at, source)
       VALUES ('alice', ?, 'Left unclassified by the agent.', 1, 2, '2026-09-16T00:00:00.000Z', 'implicit')`,
    )
      .bind(mem.id)
      .run()
    const proposalId = await seedProposal('create_category', {
      parentId: null,
      slug: 'databases',
      label: 'Databases',
      description: 'Database choices.',
      boundary: 'NOT here: application code.',
      axisHint: null,
    })

    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })

    expect(await env.DB.prepare('SELECT count(*) AS n FROM catalog_skips').first('n')).toBe(0)
    expect(await selectBatch(env, 'alice', 10, '2000-01-01T00:00:00.000Z')).toContain(mem.id)
    expect(
      await env.DB.prepare(
        'SELECT category_count, orphan_count, skipped_count FROM catalog_state WHERE owner_id = \'alice\'',
      ).first(),
    ).toEqual({ category_count: 1, orphan_count: 1, skipped_count: 0 })
  })
  it('merges an approved category into its target', async () => {
    const from = await category('noise', 'Noise')
    const into = await category('backend', 'Backend')
    const mem = await memory('Database access')
    await assign(mem.id, from)
    const proposalId = await seedProposal(
      'merge_category',
      { fromId: from, intoId: into },
      { categoryId: from, targetCategoryId: into },
    )
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    const membership = await env.DB.prepare('SELECT category_id FROM memory_categories WHERE memory_id = ?')
      .bind(mem.id)
      .first<{ category_id: string }>()
    expect(membership?.category_id).toBe(into)
    const retired = await env.DB.prepare('SELECT state FROM categories WHERE id = ?')
      .bind(from)
      .first<{ state: string }>()
    expect(retired?.state).toBe('retired')
  })
  it('refuses to decide twice', async () => {
    const proposalId = await seedProposal('retire_category', { categoryId: 'x' }, { categoryId: null })
    await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'reject' })
    const again = await call(`/api/v1/catalog/proposals/${proposalId}`, 'POST', { decision: 'approve' })
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: 'CONFLICT' })
  })
})

describe('moving a memory between projects', () => {
  it('uses optimistic concurrency', async () => {
    const mem = await memory('Database access')
    const moved = await moveMemoryProject(env, session, mem.id, 1, 'billing')
    expect(moved.project).toBe('billing')
    expect(moved.version).toBe(2)
    await expect(moveMemoryProject(env, session, mem.id, 1, 'ops')).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
  })
  it('refuses a move that would duplicate identical content', async () => {
    const first = await memory('Database access', 'The same body.')
    await createMemory(env, session, {
      project: 'billing',
      title: 'Database access',
      content: 'The same body.',
      kind: 'fact',
      tags: [],
      source: 'Recorded for a catalog test.',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(moveMemoryProject(env, session, first.id, 1, 'billing')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('keeps update unable to change a project, so only approval can', async () => {
    const mem = await memory('Database access')
    const { updateMemory } = await import('../lib/server/memories')
    await expect(
      updateMemory(env, session, mem.id, {
        project: 'billing',
        title: mem.title,
        content: mem.content,
        kind: mem.kind,
        tags: mem.tags,
        source: mem.source,
        expectedVersion: mem.version,
      }),
    ).rejects.toMatchObject({ code: 'IMMUTABLE_PROJECT' })
  })
})

describe('scheduled dispatch', () => {
  it('starts one instance per cadence window, keyed to the window', async () => {
    await configure()
    await memory('Needs classification')
    const onBoundary = await dispatchCatalogWorkflow(env, 30 * 60_000)
    expect(onBoundary).toEqual({ dispatched: true, instanceId: 'catalog-30' })
    expect(createRun).toHaveBeenCalledWith({
      id: 'catalog-30',
      params: {
        scheduledAt: 30 * 60_000,
        owners: [{ ownerId: 'alice', dryRun: true }],
      },
    })
    // A Workflow `schedules` entry is rejected on a Free plan, so the minute
    // cron is the only thing that can start an instance.
    createRun.mockClear()
    const offBoundary = await dispatchCatalogWorkflow(env, 31 * 60_000)
    expect(offBoundary).toEqual({ dispatched: false, instanceId: null })
    expect(createRun).not.toHaveBeenCalled()
  })
  it('collapses a repeated cron event onto the instance it already made', async () => {
    await configure()
    await memory('Needs classification')
    createRun.mockRejectedValueOnce(new Error('A workflow instance with this id already exists'))
    const result = await dispatchCatalogWorkflow(env, 0)
    expect(result).toEqual({ dispatched: false, instanceId: 'catalog-0' })
  })
  it('propagates a real failure instead of hiding it', async () => {
    await configure()
    await memory('Needs classification')
    createRun.mockRejectedValueOnce(new Error('workflow limit exceeded'))
    await expect(dispatchCatalogWorkflow(env, 0)).rejects.toThrow(/limit exceeded/)
  })
  it('does nothing where the deployment declares no Workflow', async () => {
    const bare: Env = { ...env, CATALOG_WORKFLOW: undefined }
    expect(await dispatchCatalogWorkflow(bare, 0)).toEqual({ dispatched: false, instanceId: null })
  })
  it('does not create a Workflow when no owner has actionable work', async () => {
    await configure()
    expect(await dispatchCatalogWorkflow(env, 0)).toEqual({ dispatched: false, instanceId: null })
    expect(createRun).not.toHaveBeenCalled()
  })
  it('pauses scheduled work while a dry run awaits review', async () => {
    await configure()
    await memory('Needs classification')
    await env.DB.prepare(
      'INSERT INTO catalog_state(owner_id, awaiting_review) VALUES (\'alice\', 1)',
    ).run()
    expect(await dispatchCatalogWorkflow(env, 0)).toEqual({ dispatched: false, instanceId: null })
  })
  it('stops automatic dispatch at the daily budget but lets a manual run continue with a warning', async () => {
    await configure({ dailyTokenBudget: 10000 })
    await memory('Needs classification')
    const historicalRun = await openRun('live', 'succeeded')
    await env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, tool_calls_json, prompt_tokens, completion_tokens, created_at)
       VALUES (?, 'alice', 0, 0, '[]', 8000, 2000, ?)`,
    )
      .bind(historicalRun, new Date().toISOString())
      .run()

    expect(await dispatchCatalogWorkflow(env, 0)).toEqual({ dispatched: false, instanceId: null })
    const manual = await call('/api/v1/catalog/runs', 'POST', {})
    expect(manual.status).toBe(202)
    expect(manual.body).toMatchObject({ budgetWarning: true })
  })
  it('anchors the next run to the scheduled window and lets manual runs preserve it', async () => {
    await configure({ intervalMinutes: 60 })
    const scheduledRun = await openRun('live', 'running')
    await finishRun(env, 'alice', scheduledRun, 'succeeded', undefined, 30 * 60_000)
    expect(
      await env.DB.prepare('SELECT next_run_at FROM catalog_state WHERE owner_id = \'alice\'').first('next_run_at'),
    ).toBe(new Date(90 * 60_000).toISOString())

    const manualRun = await openRun('live', 'running')
    await finishRun(env, 'alice', manualRun, 'succeeded')
    expect(
      await env.DB.prepare('SELECT next_run_at FROM catalog_state WHERE owner_id = \'alice\'').first('next_run_at'),
    ).toBe(new Date(90 * 60_000).toISOString())
  })
  it('backs scheduled failures off on the half-hour grid and resets after success', async () => {
    await configure()
    const first = await openRun('live', 'running')
    await finishRun(env, 'alice', first, 'failed', 'PROVIDER_UNAVAILABLE', 30 * 60_000)
    expect(
      await env.DB.prepare(
        'SELECT next_run_at, failure_streak FROM catalog_state WHERE owner_id = \'alice\'',
      ).first(),
    ).toEqual({ next_run_at: new Date(150 * 60_000).toISOString(), failure_streak: 1 })

    const second = await openRun('live', 'running')
    await finishRun(env, 'alice', second, 'failed', 'PROVIDER_UNAVAILABLE', 150 * 60_000)
    expect(
      await env.DB.prepare(
        'SELECT next_run_at, failure_streak FROM catalog_state WHERE owner_id = \'alice\'',
      ).first(),
    ).toEqual({ next_run_at: new Date(510 * 60_000).toISOString(), failure_streak: 2 })

    const manual = await openRun('live', 'running')
    await finishRun(env, 'alice', manual, 'succeeded')
    expect(
      await env.DB.prepare('SELECT failure_streak FROM catalog_state WHERE owner_id = \'alice\'')
        .first('failure_streak'),
    ).toBe(0)
  })
  it('rebuilds run and daily token metrics idempotently from the turn journal', async () => {
    await configure()
    const runId = await openRun('live', 'running')
    await env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, tool_calls_json, prompt_tokens, completion_tokens, created_at)
       VALUES (?, 'alice', 0, 0, '[{"id":"a"},{"id":"b"}]', 120, 30, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(runId)
      .run()
    await finishRun(env, 'alice', runId, 'succeeded')
    await finishRun(env, 'alice', runId, 'succeeded')

    expect(
      await env.DB.prepare(
        'SELECT turns, tool_calls, prompt_tokens, completion_tokens FROM catalog_runs WHERE id = ?',
      ).bind(runId).first(),
    ).toEqual({ turns: 1, tool_calls: 2, prompt_tokens: 120, completion_tokens: 30 })
    expect(
      await env.DB.prepare(
        `SELECT runs, turns, tool_calls, prompt_tokens, completion_tokens
         FROM catalog_metrics_daily WHERE owner_id = 'alice' AND day = '2026-09-16'`,
      ).first(),
    ).toEqual({ runs: 1, turns: 1, tool_calls: 2, prompt_tokens: 120, completion_tokens: 30 })
  })
})
