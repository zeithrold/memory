import type { Env } from '../lib/server/env'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { catalogRunResponse } from '../components/api-schemas'
import { api } from './api'
import { assign, call, category, configure, fixture, jwtVerify, memory, openRun } from './catalog-runs-fixture'

it(
  'starting a run > creates the run row, starts the instance and reports the identifier',
  async () => {
    await configure()
    const { status, body } = await call('/api/v1/catalog/runs', 'POST', {})
    expect(status).toBe(202)
    expect(body).toMatchObject({ status: 'queued', mode: 'live' })
    expect(fixture.createRun).toHaveBeenCalledOnce()
    const params = z.looseObject(
      { id: z.string(), params: z.looseObject({ ownerId: z.string(), runId: z.string() }) },
    )
      .parse(
        fixture.createRun.mock.calls[0]?.[0],
      )
    expect(params.params.ownerId).toBe('alice')
    // The instance and the audit row share one identifier.
    expect(params.id).toBe(params.params.runId)
    expect(params.id).toBe(body?.runId)
    const row = await fixture.env.DB.prepare('SELECT status, trigger FROM catalog_runs WHERE id = ?')
      .bind(params.id)
      .first<{ status: string, trigger: string }>()
    expect(row).toEqual({ status: 'running', trigger: 'manual' })
  },
)

it(
  'starting a run > honours a dry run and fails closed without a Workflow binding',
  async () => {
    await configure()
    const dry = await call('/api/v1/catalog/runs', 'POST', { dryRun: true })
    expect(dry.body).toMatchObject({ mode: 'dry_run' })

    const bare: Env = { ...fixture.env, CATALOG_WORKFLOW: undefined }
    const response = await api(
      new Request(
        'https://memory.example/api/v1/catalog/runs',
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': 'access.jwt', 'Content-Type': 'application/json' },
          body: '{}',
        },
      ),
      bare,
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CATALOG_DISABLED' })
  },
)

it('starting a run > refuses a second run while one is in flight', async () => {
  await configure()
  await call('/api/v1/catalog/runs', 'POST', {})
  const second = await call('/api/v1/catalog/runs', 'POST', {})
  expect(second.status).toBe(409)
  expect(second.body).toMatchObject({ code: 'RUN_IN_PROGRESS' })
})

it('starting a run > refuses to start when the account has no provider', async () => {
  const { status, body } = await call('/api/v1/catalog/runs', 'POST', {})
  expect(status).toBe(409)
  expect(body).toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
})

it(
  'the catalog view and run timeline > returns both levels of the catalog',
  async () => {
    const root = await category('backend', 'Backend')
    await fixture.env.DB.prepare(
      `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
member_count, state, created_by, created_at, updated_at)
       VALUES (?, 'alice', ?, 'databases', 'Databases', 'Database choices.', 'NOT here: application code.',
2, 0, 'active', 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        crypto.randomUUID(),
        root,
      )
      .run()
    const { status, body } = await call('/api/v1/catalog')
    expect(status).toBe(200)
    const categories = z.array(z.looseObject({ slug: z.string(), parentId: z.union([
      z.null(),
      z.string(),
    ]), depth: z.number() })).parse(body?.categories)
    expect(categories.map(entry => [entry.slug, entry.depth])).toEqual([
      ['backend', 1],
      ['databases', 2],
    ])
    expect(categories[1]?.parentId).toBe(root)
    expect(body).toMatchObject({ orphans: 0, pendingProposals: 0, pendingAdvice: null })
    expect(categories[0]).toMatchObject({
      axisHint: null,
      boundary: 'NOT here: anything else.',
      description: 'Related entries.',
    })
  },
)

it(
  'the catalog view and run timeline > pages category members and lists direct children',
  async () => {
    const root = await category('backend', 'Backend')
    const childId = crypto.randomUUID()
    await fixture.env.DB.prepare(
      `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
member_count, state, created_by, created_at, updated_at)
       VALUES (?, 'alice', ?, 'databases', 'Databases', 'Database choices.', 'NOT here: application code.',
2, 0, 'active', 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        childId,
        root,
      )
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
    const children = z.array(z.looseObject({ id: z.string() })).parse(page.body?.children)
    expect(children.map(child => child.id)).toEqual([childId])
    const memories = z.array(z.looseObject({ id: z.string(), isPrimary: z.boolean() })).parse(page.body?.memories)
    expect(memories.map(entry => entry.id)).toEqual([first.id, second.id])
    expect(memories[0]?.isPrimary).toBe(true)

    const childPage = await call(`/api/v1/catalog/categories/${childId}`)
    expect(
      (z.array(z.looseObject({ id: z.string() })).parse(childPage.body?.memories)).map(
        entry => entry.id,
      ),
    )
      .toEqual(
        [second.id],
      )
  },
)

it(
  'the catalog view and run timeline > pages runs and run steps, and keeps operator prompts off the Workflow params',
  async () => {
    await configure()
    await fixture.env.DB.prepare(
      ('INSERT INTO catalog_state(owner_id, version, pending_advice) VALUES (\'alice\', 1,'
        + ' \'Prefer fewer top-level categories.\')\n       ON CONFLICT(owner_id) DO UPDATE SE'
        + 'T pending_advice = excluded.pending_advice'),
    ).run()
    const { status, body } = await call('/api/v1/catalog/runs', 'POST', {
      prompt: 'Focus on backend memories.',
    })
    expect(status).toBe(202)
    const params = z.looseObject({ params: z.record(z.string(), z.unknown()) }).parse(
      fixture.createRun.mock.calls[0]?.[0],
    )
    expect(params.params).not.toHaveProperty('prompt')
    expect(params.params).not.toHaveProperty('operatorPrompt')
    const runId = z.string().parse(body?.runId)
    const stored = await fixture.env.DB.prepare(
      'SELECT operator_prompt FROM catalog_runs WHERE id = ?',
    )
      .bind(runId)
      .first<{ operator_prompt: string }>()
    expect(stored?.operator_prompt).toContain('Focus on backend memories.')
    expect(stored?.operator_prompt).toContain('Prefer fewer top-level categories.')
    expect(
      await fixture.env.DB.prepare('SELECT pending_advice FROM catalog_state WHERE owner_id = \'alice\'')
        .first('pending_advice'),
    )
      .toBeNull()

    const listed = await call('/api/v1/catalog/runs?limit=1&offset=0')
    expect(listed.body).toMatchObject({ total: 1, offset: 0, limit: 1 })
    expect((z.array(z.unknown()).parse(listed.body?.runs)).length).toBe(1)

    await fixture.env.DB.prepare(
      ('INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kin'
        + 'd, effect,\narguments_json, decision, created_at)\n       VALUES (?, \'alice\', 0, 0'
        + ', 0, \'finish\', \'finish\', \'control\', \'{}\', \'applied\', \'2026-09-16T00:00:00.000Z\')'),
    )
      .bind(
        runId,
      )
      .run()
    const detail = await call(`/api/v1/catalog/runs/${runId}?limit=1&offset=0`)
    expect(detail.status).toBe(200)
    expect(detail.body?.totalActions).toBe(1)
    expect(detail.body?.offset).toBe(0)
    expect(detail.body?.limit).toBe(1)
    expect(z.string().parse(detail.body?.operatorPrompt)).toContain('Focus on backend memories.')
  },
)

it(
  'the catalog view and run timeline > replays a run turn by turn with the decision for each call',
  async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, tool_calls_json, tool_results_json,
prompt_tokens, completion_tokens, latency_ms, created_at)
       VALUES (?, 'alice', 0, 0, 'Thinking about the batch.', '[{"id":"c1","name":"assign","arguments":{}}]',
'[]', 10, 4, 900, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        runId,
      )
      .run()
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, arguments_json, rationale, decision, policy_reason, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', ?, ?, '{}', 'Go work.',
'applied', NULL, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        runId,
        mem.id,
        cat,
      )
      .run()

    const { body } = await call(`/api/v1/catalog/runs/${runId}`)
    const detail = catalogRunResponse.parse(body)
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
  },
)

it('the catalog view and run timeline > hides another account\'s run', async () => {
  const runId = await openRun()
  const { status, body } = await call(`/api/v1/catalog/runs/${runId}`)
  expect(status).toBe(200)
  jwtVerify.mockResolvedValue({ payload: { sub: 'bob' } })
  const other = await call(`/api/v1/catalog/runs/${runId}`)
  expect(other.status).toBe(404)
  expect(other.body).toMatchObject({ code: 'RUN_NOT_FOUND' })
  expect(body).not.toBeNull()
})
