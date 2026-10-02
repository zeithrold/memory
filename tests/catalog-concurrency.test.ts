import type { Env } from '../lib/server/env'
import { expect, it } from 'vitest'
import { dispatchCatalogWorkflow, finishRun } from '../lib/server/catalog/run'
import { createMemory, moveMemoryProject } from '../lib/server/memories'
import { call, configure, fixture, memory, openRun, session } from './catalog-runs-fixture'

it('moving a memory between projects > uses optimistic concurrency', async () => {
  const mem = await memory('Database access')
  const moved = await moveMemoryProject(
    fixture.env,
    session,
    { id: mem.id, expectedVersion: 1, targetProject: 'billing' },
  )
  expect(moved.project).toBe('billing')
  expect(moved.version).toBe(2)
  await expect(moveMemoryProject(
    fixture.env,
    session,
    { id: mem.id, expectedVersion: 1, targetProject: 'ops' },
  )).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  })
})

it(
  'moving a memory between projects > refuses a move that would duplicate identical content',
  async () => {
    const first = await memory('Database access', 'The same body.')
    await createMemory(fixture.env, session, {
      project: 'billing',
      title: 'Database access',
      content: 'The same body.',
      kind: 'fact',
      tags: [],
      source: 'Recorded for a catalog test.',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(moveMemoryProject(
      fixture.env,
      session,
      { id: first.id, expectedVersion: 1, targetProject: 'billing' },
    )).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  },
)

it(
  'moving a memory between projects > keeps update unable to change a project, so only approval can',
  async () => {
    const mem = await memory('Database access')
    const { updateMemory } = await import('../lib/server/memories')
    await expect(
      updateMemory(fixture.env, session, mem.id, {
        project: 'billing',
        title: mem.title,
        content: mem.content,
        kind: mem.kind,
        tags: mem.tags,
        source: mem.source,
        expectedVersion: mem.version,
      }),
    ).rejects.toMatchObject({ code: 'IMMUTABLE_PROJECT' })
  },
)

it(
  'scheduled dispatch > starts one instance per cadence window, keyed to the window',
  async () => {
    await configure()
    await memory('Needs classification')
    const onBoundary = await dispatchCatalogWorkflow(fixture.env, 30 * 60_000)
    expect(onBoundary).toEqual({ dispatched: true, instanceId: 'catalog-30' })
    expect(fixture.createRun).toHaveBeenCalledWith({
      id: 'catalog-30',
      params: {
        scheduledAt: 30 * 60_000,
        owners: [
          { ownerId: 'alice', dryRun: true },
        ],
      },
    })
    // A Workflow `schedules` entry is rejected on a Free plan, so the minute
    // cron is the only thing that can start an instance.
    fixture.createRun.mockClear()
    const offBoundary = await dispatchCatalogWorkflow(fixture.env, 31 * 60_000)
    expect(offBoundary).toEqual({ dispatched: false, instanceId: null })
    expect(fixture.createRun).not.toHaveBeenCalled()
  },
)

it(
  'scheduled dispatch > collapses a repeated cron event onto the instance it already made',
  async () => {
    await configure()
    await memory('Needs classification')
    fixture.createRun.mockRejectedValueOnce(
      new Error('A workflow instance with this id already exists'),
    )
    const result = await dispatchCatalogWorkflow(fixture.env, 0)
    expect(result).toEqual({ dispatched: false, instanceId: 'catalog-0' })
  },
)

it('scheduled dispatch > propagates a real failure instead of hiding it', async () => {
  await configure()
  await memory('Needs classification')
  fixture.createRun.mockRejectedValueOnce(new Error('workflow limit exceeded'))
  await expect(dispatchCatalogWorkflow(fixture.env, 0)).rejects.toThrow(/limit exceeded/)
})

it(
  'scheduled dispatch > does nothing where the deployment declares no Workflow',
  async () => {
    const bare: Env = { ...fixture.env, CATALOG_WORKFLOW: undefined }
    expect(await dispatchCatalogWorkflow(bare, 0)).toEqual({ dispatched: false, instanceId: null })
  },
)

it(
  'scheduled dispatch > does not create a Workflow when no owner has actionable work',
  async () => {
    await configure()
    expect(await dispatchCatalogWorkflow(fixture.env, 0)).toEqual(
      { dispatched: false, instanceId: null },
    )
    expect(fixture.createRun).not.toHaveBeenCalled()
  },
)

it(
  'scheduled dispatch > pauses scheduled work while a dry run awaits review',
  async () => {
    await configure()
    await memory('Needs classification')
    await fixture.env.DB.prepare(
      'INSERT INTO catalog_state(owner_id, awaiting_review) VALUES (\'alice\', 1)',
    ).run()
    expect(await dispatchCatalogWorkflow(fixture.env, 0)).toEqual(
      { dispatched: false, instanceId: null },
    )
  },
)

it(
  'scheduled dispatch > stops automatic dispatch at the daily budget but lets a manual run continue with a warning',
  async () => {
    await configure({ dailyTokenBudget: 10000 })
    await memory('Needs classification')
    const historicalRun = await openRun('live', 'succeeded')
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, tool_calls_json, prompt_tokens,
completion_tokens, created_at)
       VALUES (?, 'alice', 0, 0, '[]', 8000, 2000, ?)`,
    )
      .bind(historicalRun, new Date().toISOString())
      .run()

    expect(await dispatchCatalogWorkflow(fixture.env, 0)).toEqual(
      { dispatched: false, instanceId: null },
    )
    const manual = await call('/api/v1/catalog/runs', 'POST', {})
    expect(manual.status).toBe(202)
    expect(manual.body).toMatchObject({ budgetWarning: true })
  },
)

it(
  'scheduled dispatch > anchors the next run to the scheduled window and lets manual runs preserve it',
  async () => {
    await configure({ intervalMinutes: 60 })
    const scheduledRun = await openRun('live', 'running')
    await finishRun(
      fixture.env,
      'alice',
      {
        runId: scheduledRun,
        status: 'succeeded',
        errorCode: undefined,
        scheduledAt: 30 * 60_000,
      },
    )
    expect(
      await fixture.env.DB.prepare('SELECT next_run_at FROM catalog_state WHERE owner_id = \'alice\'')
        .first(
          'next_run_at',
        ),
    )
      .toBe(
        new Date(90 * 60_000).toISOString(),
      )

    const manualRun = await openRun('live', 'running')
    await finishRun(fixture.env, 'alice', { runId: manualRun, status: 'succeeded' })
    expect(
      await fixture.env.DB.prepare('SELECT next_run_at FROM catalog_state WHERE owner_id = \'alice\'')
        .first(
          'next_run_at',
        ),
    )
      .toBe(
        new Date(90 * 60_000).toISOString(),
      )
  },
)

it(
  'scheduled dispatch > backs scheduled failures off on the half-hour grid and resets after success',
  async () => {
    await configure()
    const first = await openRun('live', 'running')
    await finishRun(
      fixture.env,
      'alice',
      {
        runId: first,
        status: 'failed',
        errorCode: 'PROVIDER_UNAVAILABLE',
        scheduledAt: 30 * 60_000,
      },
    )
    expect(
      await fixture.env.DB.prepare(
        'SELECT next_run_at, failure_streak FROM catalog_state WHERE owner_id = \'alice\'',
      ).first(),
    ).toEqual({ next_run_at: new Date(150 * 60_000).toISOString(), failure_streak: 1 })

    const second = await openRun('live', 'running')
    await finishRun(
      fixture.env,
      'alice',
      {
        runId: second,
        status: 'failed',
        errorCode: 'PROVIDER_UNAVAILABLE',
        scheduledAt: 150 * 60_000,
      },
    )
    expect(
      await fixture.env.DB.prepare(
        'SELECT next_run_at, failure_streak FROM catalog_state WHERE owner_id = \'alice\'',
      ).first(),
    ).toEqual({ next_run_at: new Date(510 * 60_000).toISOString(), failure_streak: 2 })

    const manual = await openRun('live', 'running')
    await finishRun(fixture.env, 'alice', { runId: manual, status: 'succeeded' })
    expect(
      await fixture.env.DB.prepare('SELECT failure_streak FROM catalog_state WHERE owner_id = \'alice\'')
        .first('failure_streak'),
    )
      .toBe(
        0,
      )
  },
)

it(
  'scheduled dispatch > rebuilds run and daily token metrics idempotently from the turn journal',
  async () => {
    await configure()
    const runId = await openRun('live', 'running')
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, tool_calls_json, prompt_tokens,
completion_tokens, created_at)
       VALUES (?, 'alice', 0, 0, '[{"id":"a"},{"id":"b"}]', 120, 30, '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        runId,
      )
      .run()
    await finishRun(fixture.env, 'alice', { runId, status: 'succeeded' })
    await finishRun(fixture.env, 'alice', { runId, status: 'succeeded' })

    expect(
      await fixture.env.DB.prepare(
        'SELECT turns, tool_calls, prompt_tokens, completion_tokens FROM catalog_runs WHERE id = ?',
      )
        .bind(

          runId,
        )
        .first(),
    )
      .toEqual(
        { turns: 1, tool_calls: 2, prompt_tokens: 120, completion_tokens: 30 },
      )
    expect(
      await fixture.env.DB.prepare(
        `SELECT runs, turns, tool_calls, prompt_tokens, completion_tokens
         FROM catalog_metrics_daily WHERE owner_id = 'alice' AND day = '2026-09-16'`,
      ).first(),
    ).toEqual({ runs: 1, turns: 1, tool_calls: 2, prompt_tokens: 120, completion_tokens: 30 })
  },
)
