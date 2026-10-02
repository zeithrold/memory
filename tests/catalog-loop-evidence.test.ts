import { expect, it, vi } from 'vitest'
import { selectBatch } from '../lib/server/catalog/model'
import { consolidate, finalizeBatch, startBatch } from '../lib/server/catalog/run'
import { updateCatalogSettings } from '../lib/server/catalog/settings'
import { actTurn, thinkTurn } from '../lib/server/catalog/turn'
import { createMemory } from '../lib/server/memories'
import { requiredMemory } from './catalog-loop-evidence-fixture'
import { actions, alice, calls, categoryCount, fixture, input, script, seedCategory } from './catalog-loop-fixture'

it(
  'the agent loop > accumulates evidence for an equivalent proposal across runs',
  async () => {
    const proposal = {
      name: 'propose_category',
      arguments: {
        slug: 'databases',
        label: 'Databases',
        description: 'Database access.',
        boundary: 'NOT here: release process.',
        reason: 'Supported again.',
      },
    }
    script(calls([proposal]))
    await thinkTurn(input())
    await actTurn(input(), 0)

    const secondRun = crypto.randomUUID()
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES (?, 'alice',
'manual', 'live', 'running', ?)`,
    )
      .bind(
        secondRun,
        new Date().toISOString(),
      )
      .run()
    vi.unstubAllGlobals()
    script(calls([proposal]))
    await thinkTurn(input({ runId: secondRun }))
    await actTurn(input({ runId: secondRun }), 0)

    const rows = await fixture.env.DB.prepare('SELECT evidence_runs FROM catalog_proposals')
      .all<{ evidence_runs: number }>()
    // One proposal with two runs of evidence, not two duplicate proposals.
    expect(rows.results).toEqual([
      { evidence_runs: 2 },
    ])
  },
)

it(
  'the agent loop > keeps distinct category suggestions separate in one turn',
  async () => {
    script(calls([
      'databases',
      'release',
      'interviews',
      'travel',
    ].map(slug => ({
      name: 'propose_category',
      arguments: {
        slug,
        label: slug,
        description: `${slug} memories.`,
        boundary: `NOT here: anything outside ${slug}.`,
        reason: `${slug} needs its own category.`,
      },
    }))))
    await thinkTurn(input())
    await actTurn(input(), 0)

    const proposals = await fixture.env.DB.prepare(
      'SELECT id, evidence_runs, json_extract(payload_json, \'$.slug\') AS slug FROM catalog_proposals ORDER BY slug',
    )
      .all<{ id: string, evidence_runs: number, slug: string }>()
    expect(proposals.results.map(row => row.slug)).toEqual([
      'databases',
      'interviews',
      'release',
      'travel',
    ])
    expect(new Set(proposals.results.map(row => row.id)).size).toBe(4)
    expect(proposals.results.every(row => row.evidence_runs === 1)).toBe(true)
  },
)

it(
  'the agent loop > counts at most one piece of evidence for a proposal in one run',
  async () => {
    const proposal = {
      name: 'propose_category',
      arguments: {
        slug: 'databases',
        label: 'Databases',
        description: 'Database access.',
        boundary: 'NOT here: release process.',
        reason: 'The batch needs it.',
      },
    }
    script(calls([proposal, proposal]))
    await thinkTurn(input())
    await actTurn(input(), 0)

    expect(
      await fixture.env.DB.prepare('SELECT evidence_runs FROM catalog_proposals').first('evidence_runs'),
    )
      .toBe(
        1,
      )
    expect(
      await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_proposal_evidence').first('n'),
    )
      .toBe(
        1,
      )

    await updateCatalogSettings(fixture.env, 'alice', { autoApplyStructural: true })
    expect(await consolidate(fixture.env, 'alice', fixture.runId)).toMatchObject(
      { applied: 0, queued: 1 },
    )
    expect(await categoryCount()).toBe(0)
  },
)

it(
  'the agent loop > does not create implicit skips when a dry-run batch is finalized',
  async () => {
    await finalizeBatch(
      fixture.env,
      'alice',
      {
        runId: fixture.runId,
        memoryIds: fixture.memoryIds,
        stats: { turns: 1, toolCalls: 1, rejected: 0, applied: 0 },
        mode: 'dry_run',
      },
    )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_skips').first('n')).toBe(
      0,
    )
  },
)

it(
  'the agent loop > caps a scheduled dry-run batch at six memories',
  async () => {
    for (let index = 0; index < 5; index++) {
      await createMemory(fixture.env, alice, {
        project: 'global',
        title: `Extra memory ${index}`,
        content: 'Additional unclassified content.',
        kind: 'fact',
        tags: [],
        source: 'Catalog batch cap test.',
        idempotencyKey: crypto.randomUUID(),
      })
    }
    await updateCatalogSettings(fixture.env, 'alice', { maxBatch: 10, maxToolCalls: 12 })
    const opened = await startBatch(fixture.env, 'alice', { runId: fixture.runId, dryRun: true, maxMemories: 6 })
    expect(opened.memoryIds).toHaveLength(6)
  },
)

it(
  'the agent loop > retries an implicit skip three times and keeps an explicit skip suppressed',
  async () => {
    const stats = { turns: 1, toolCalls: 0, rejected: 0, applied: 0 }
    const cutoff = '2000-01-01T00:00:00.000Z'
    const firstMemory = requiredMemory(0)
    const secondMemory = requiredMemory(1)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await finalizeBatch(
        fixture.env,
        'alice',
        { runId: fixture.runId, memoryIds: [firstMemory], stats, mode: 'live' },
      )
      expect(
        (await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: cutoff })).includes(
          firstMemory,
        ),
      )
        .toBe(

          false,
        )
      if (attempt < 3) {
        await fixture.env.DB.prepare(
          'UPDATE catalog_skips SET retry_after = ? WHERE memory_id = ?',
        )
          .bind('2000-01-01T00:00:00.000Z', firstMemory)
          .run()
      }
      expect(
        (await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: cutoff })).includes(
          firstMemory,
        ),
      )
        .toBe(

          attempt < 3,
        )
    }

    vi.unstubAllGlobals()
    script(calls([
      { name: 'skip', arguments: { memoryId: secondMemory, reason: 'A settled one-off.' } },
    ]))
    await thinkTurn(input({ turn: 1 }))
    await actTurn(input({ turn: 1 }), 0)
    expect(
      (await selectBatch(fixture.env, 'alice', { limit: 10, reviewCutoff: cutoff })).includes(
        secondMemory,
      ),
    )
      .toBe(
        false,
      )
  },
)

it(
  'the agent loop > keeps a settled classification unless the memory changed',
  async () => {
    const first = await seedCategory('backend', 'Backend')
    const second = await seedCategory('release', 'Release process')
    script(
      calls(
        [
          {

            name: 'assign',

            arguments: { memoryId: fixture.memoryIds[0], categoryId: first, confidence: 0.9, reason: 'Initial.' },

          },
        ],
      ),
    )
    await thinkTurn(input())
    await actTurn(input(), 0)

    vi.unstubAllGlobals()
    script(calls([
      {
        name: 'assign',
        arguments: {
          memoryId: fixture.memoryIds[0],
          categoryId: second,
          confidence: 0.9,
          reason: 'Second thoughts.',
        },
      },
    ]))
    await thinkTurn(input({ turn: 1 }))
    const acted = await actTurn(input({ turn: 1 }), 0)
    expect(acted.rejected).toBe(1)
    expect((await actions()).at(-1)?.policy_reason).toContain('has not changed since')
  },
)
