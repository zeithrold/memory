import { expect, it } from 'vitest'
import { maintenance } from '../lib/server/indexer'
import { searchMemories } from '../lib/server/memories'
import { alice, assign, category, childCategory, fixture, memory, QUERY, starvedLibrary } from './retrieval-fixture'

it(
  'catalog search > includes descendants when memory search scopes to a root category',
  async () => {
    const root = await category(
      'engineering',
      'Engineering',
      'Software engineering.',
      'NOT here: travel.',
    )
    const database = await childCategory(
      root,
      'database',
      { label: 'Database', description: 'Database storage.', boundary: 'NOT here: frontend.' },
    )
    const created = await memory('Database access', 'Database access uses sqlc.')
    await assign(created.id, database)
    const result = await searchMemories(fixture.env, alice, {
      query: 'database',
      categoryIds: [root],
    })
    expect(result.memories.map(entry => entry.id)).toEqual([created.id])
  },
)

it(
  'retrieval benchmark: flat versus catalog routing > does not lose recall on the starved fixture',
  async () => {
    const { starved } = await starvedLibrary()
    const relevant = new Set([starved])
    const report: Record<string, number> = {}
    for (const mode of ['flat', 'catalog'] as const) {
      const result = await searchMemories(fixture.env, alice, {
        query: QUERY,
        project: 'global',
        limit: 8,
        mode,
        balance: 'sqrt',
      })
      const found = result.memories.filter(entry => relevant.has(entry.id)).length
      report[mode] = found / relevant.size
    }
    // Printed so a run of the suite reports the number a reviewer would ask for.
    process.stdout.write(`recall@8 starved-category fixture: ${JSON.stringify(report)}\n`)
    expect(report.catalog).toBeGreaterThanOrEqual(report.flat ?? 0)
    expect(report.catalog).toBe(1)
  },
)

it(
  'audit retention > prunes finished runs but never a live one, whose rows are its journal',
  async () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString()
    const live = crypto.randomUUID()
    const done = crypto.randomUUID()
    for (const [id, status] of [
      [live, 'running'],
      [done, 'succeeded'],
    ] as const) {
      await fixture.env.DB.prepare(
        `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at, finished_at)
VALUES (?, 'alice', 'manual', 'live', ?, ?, ?)`,
      ).bind(id, status, old, old).run()
      await fixture.env.DB.prepare(
        `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, created_at) VALUES (?,
'alice', 0, 0, 'x', ?)`,
      )
        .bind(

          id,

          old,
        )
        .run()
      await fixture.env.DB.prepare(
        `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
arguments_json, decision, created_at)
         VALUES (?, 'alice', 0, 0, 0, 'assign', 'assign', 'immediate', '{}', 'applied',
?)`,
      )
        .bind(

          id,

          old,
        )
        .run()
    }
    await maintenance(fixture.env)
    const actions = await fixture.env.DB.prepare('SELECT run_id FROM catalog_actions')
      .all<{ run_id: string }>()
    // A retried step finds its own journal row; deleting it mid-run would let
    // the same effect land twice.
    expect(actions.results.map(row => row.run_id)).toEqual([live])
    const turns = await fixture.env.DB.prepare('SELECT run_id FROM catalog_turns').all<{ run_id: string }>()
    expect(turns.results.map(row => row.run_id)).toEqual([live])
  },
)
