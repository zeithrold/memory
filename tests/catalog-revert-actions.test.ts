import { expect, it } from 'vitest'
import { revertRun } from '../lib/server/catalog/query'
import { assign, call, category, fixture, memory, openRun } from './catalog-runs-fixture'

it(
  'reverting a run > removes an assignment the run applied',
  async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    await assign(mem.id, cat)
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, arguments_json, before_json, decision, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', ?, ?, '{}', '[]',
'applied', '2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        runId,
        mem.id,
        cat,
      )
      .run()

    const { status, body } = await call(`/api/v1/catalog/runs/${runId}/revert`, 'POST', {})
    expect(status).toBe(200)
    expect(body).toMatchObject({ reverted: 1, skipped: 0 })
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM memory_categories').first('n'))
      .toBe(
        0,
      )
    const run = await fixture.env.DB.prepare('SELECT status FROM catalog_runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string }>()
    expect(run?.status).toBe('reverted')
    // The reversal itself is auditable.
    const revert = await fixture.env.DB.prepare('SELECT decision, revert_of FROM catalog_actions WHERE batch = -2')
      .first<{ decision: string, revert_of: number }>()
    expect(revert?.decision).toBe('applied')
    expect(revert?.revert_of).toBeGreaterThan(0)
  },
)

it(
  'reverting a run > reports what it could not undo instead of claiming success',
  async () => {
    const runId = await openRun()
    const mem = await memory('Database access')
    const cat = await category('backend', 'Backend')
    // A hard delete was recorded, which has no inverse here.
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, arguments_json, decision, created_at)
       VALUES (?, 'alice', 0, 0, 0, 'unassign', 'unassign', 'immediate', ?, ?, '{}', 'applied',
'2026-09-16T00:00:00.000Z')`,
    )
      .bind(
        runId,
        mem.id,
        cat,
      )
      .run()
    const result = await revertRun(fixture.env, 'alice', runId)
    expect(result).toEqual({ reverted: 0, skipped: 1 })
  },
)
