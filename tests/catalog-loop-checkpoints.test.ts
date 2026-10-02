import { expect, it } from 'vitest'
import { selectBatch } from '../lib/server/catalog/model'
import { actTurn, thinkTurn } from '../lib/server/catalog/turn'
import { requiredMemory } from './catalog-loop-evidence-fixture'
import { actions, calls, fixture, input, script, seedCategory } from './catalog-loop-fixture'

it(
  'the agent loop > checkpoints an unchanged membership until seven days pass or the memory changes',
  async () => {
    const categoryId = await seedCategory('backend', 'Backend')
    const memoryId = requiredMemory(0)
    // The update trigger archives the previous row at the same version. Remove
    // the create-time revision before backdating this fixture.
    await fixture.env.DB.prepare('DELETE FROM revisions WHERE memory_id = ?').bind(memoryId).run()
    await fixture.env.DB.prepare('DELETE FROM index_jobs WHERE memory_id = ?').bind(memoryId).run()
    await fixture.env.DB.prepare(
      'UPDATE memories SET updated_at = ? WHERE id = ?',
    )
      .bind('2019-01-01T00:00:00.000Z', memoryId)
      .run()
    await fixture.env.DB.prepare(
      `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
       VALUES ('alice', ?, ?, 1, 0.9, 'agent', 1, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`,
    )
      .bind(
        memoryId,
        categoryId,
      )
      .run()
    script(calls([
      {
        name: 'confirm_memberships',
        arguments: { memoryId, reason: 'The existing category remains correct.' },
      },
    ]))
    await thinkTurn(input())
    expect(await actTurn(input(), 0)).toMatchObject({ applied: 1, rejected: 0 })

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    expect(
      (await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: sevenDaysAgo })).includes(
        memoryId,
      ),
    )
      .toBe(
        false,
      )

    await fixture.env.DB.prepare(
      'UPDATE memories SET version = version + 1, updated_at = ? WHERE id = ?',
    )
      .bind(new Date(Date.now() + 1000).toISOString(), memoryId)
      .run()
    expect(
      (await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: sevenDaysAgo })).includes(
        memoryId,
      ),
    )
      .toBe(
        true,
      )
  },
)

it(
  'the agent loop > enforces the batch churn budget',
  async () => {
    const first = await seedCategory('backend', 'Backend')
    const second = await seedCategory('release', 'Release process')
    // Already at the whole batch's budget of one re-classification.
    script(calls([
      {
        name: 'assign',
        arguments: {
          memoryId: fixture.memoryIds[0],
          categoryId: second,
          confidence: 0.9,
          reason: 'Over budget.',
        },
      },
    ]))
    await fixture.env.DB.prepare(
      `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
       VALUES ('alice', ?, ?, 1, 0.9, 'agent', 1, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`,
    )
      .bind(
        fixture.memoryIds[0],
        first,
      )
      .run()
    await thinkTurn(input())
    const acted = await actTurn(input(), 1)
    expect(acted.rejected).toBe(1)
    expect((await actions()).at(-1)?.policy_reason).toContain('budget')
  },
)

it('the agent loop > ends the batch when the model calls finish', async () => {
  script(calls([
    { name: 'finish', arguments: { summary: 'Classified two memories.' } },
  ]))
  await thinkTurn(input())
  const acted = await actTurn(input(), 0)
  expect(acted.finished).toBe(true)
  expect((await actions())[0]).toMatchObject({ tool: 'finish', decision: 'applied' })
})
