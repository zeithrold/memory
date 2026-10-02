import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { fixture, insertCategory } from './catalog-fixture'
import { database } from './database'

function legacySql1(): string {
  return ('\n        INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_a'
    + 't)\n        VALUES (\'run-1\', \'alice\', \'schedule\', \'dry_run\', \'succeeded\', \'2026-0'
    + '9-16T00:00:00.000Z\');\n        INSERT INTO catalog_turns(\n          run_id, owner'
    + '_id, batch, turn, tool_calls_json, prompt_tokens,\n          completion_tokens, c'
    + 'reated_at\n        ) VALUES (\n          \'run-1\', \'alice\', 0, 0, \'[{"id":"call-1"}'
    + ']\', 123, 45,\n          \'2026-09-16T00:00:01.000Z\'\n        );\n        INSERT INTO'
    + ' catalog_proposals(\n          id, owner_id, first_run_id, last_run_id, kind, pay'
    + 'load_json,\n          rationale, evidence_runs, status, created_at\n        ) VALU'
    + 'ES (\n          \'proposal-1\', \'alice\', \'run-1\', \'run-1\', \'create_category\',\n     '
    + '     \'{"parentId":null,"slug":"databases"}\', \'overwritten\', 9, \'approved\',\n     '
    + '     \'2026-09-16T00:00:00.000Z\'\n        );\n        INSERT INTO catalog_actions(\n'
    + '          run_id, owner_id, batch, turn, call_index, tool, kind, effect,\n       '
    + '   arguments_json, result_json, rationale, decision, created_at\n        ) VALUES'
    + '\n          (\'run-1\', \'alice\', 0, 0, 0, \'propose_category\', \'create_category\', \'p'
    + 'roposal\',\n           \'{}\', \'{"proposalId":"proposal-1"}\', \'original rationale\', '
    + '\'proposed\', \'2026-09-16T00:00:01.000Z\'),\n          (\'run-1\', \'alice\', 0, 0, 1, \''
    + 'propose_category\', \'create_category\', \'proposal\',\n           \'{}\', \'{"proposalId'
    + '":"proposal-1"}\', \'different suggestion\', \'proposed\', \'2026-09-16T00:00:02.000Z\''
    + ');\n        INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version'
    + ', attempts,\ncreated_at)\n        VALUES\n          (\'alice\', \'implicit-memory\', \'L'
    + 'eft unclassified by the agent.\', 1, 1, \'2026-09-16T00:00:00.000Z\'),\n          (\''
    + 'alice\', \'explicit-memory\', \'A settled note.\', 1, 1, \'2026-09-16T00:00:00.000Z\');'
    + '\n        INSERT INTO categories(\n          id, owner_id, parent_id, slug, label,'
    + ' description, boundary, depth,\n          member_count, state, created_by, create'
    + 'd_at, updated_at\n        ) VALUES (\n          \'category-1\', \'alice\', NULL, \'data'
    + 'bases\', \'Databases\', \'Database choices.\',\n          \'NOT here: application code.'
    + '\', 1, 0, \'active\', \'user\',\n          \'2026-09-16T00:00:00.000Z\', \'2026-09-16T00:'
    + '00:00.000Z\'\n        );\n        INSERT INTO catalog_state(owner_id, category_coun'
    + 't, assigned_count, orphan_count,\nskipped_count)\n        VALUES (\'alice\', 0, 0, 0'
    + ', 2);\n        INSERT INTO catalog_metrics_daily(owner_id, day, runs, prompt_toke'
    + 'ns, completion_tokens)\n        VALUES (\'alice\', \'2026-09-16\', 1, 0, 0);\n        '
    + 'INSERT INTO agent_settings(\n          owner_id, enabled, provider, include_conte'
    + 'nt, interval_minutes, max_batch,\n          max_turns, max_tool_calls, auto_apply'
    + '_structural, dry_run_until_reviewed, updated_at\n        ) VALUES (\'alice\', 0, \'n'
    + 'one\', 0, 45, 10, 3, 8, 0, 1, \'2026-09-16T00:00:00.000Z\');\n      ')
}

function seedLegacyProvider2(legacy: ReturnType<typeof database>): void {
  legacy.sqlite.prepare(
    `INSERT INTO agent_settings(
           owner_id, enabled, provider, base_url, model,
           api_key_ciphertext, api_key_iv, api_key_hint,
           include_content, interval_minutes, max_batch, max_turns,
           max_tool_calls, auto_apply_structural, dry_run_until_reviewed,
           last_probe_at, last_probe_ok, last_probe_error, updated_at,
           daily_token_budget
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'alice',
    1,
    'openai-compatible',
    'https://api.example.com/v1',
    'catalog-model',
    'ciphertext',
    'iv',
    'hint',
    1,
    60,
    6,
    2,
    8,
    1,
    0,
    '2026-09-16T00:00:00.000Z',
    1,
    null,
    '2026-09-16T00:00:00.000Z',
    120000,
  )
}
it('catalog schema > creates every catalog table', async () => {
  const rows = await fixture.env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'catalog%' OR name IN
('categories', 'memory_categories', 'agent_settings') ORDER BY name`,
  ).all<{ name: string }>()
  expect(rows.results.map(row => row.name)).toEqual([
    'agent_settings',
    'catalog_actions',
    'catalog_memory_reviews',
    'catalog_metrics_daily',
    'catalog_proposal_evidence',
    'catalog_proposals',
    'catalog_runs',
    'catalog_skips',
    'catalog_state',
    'catalog_turns',
    'categories',
    'memory_categories',
  ])
})

it(
  'catalog schema > repairs legacy evidence, implicit skips, intervals and counters',
  () => {
    const legacy = database({ through: '0003_catalog.sql' })
    try {
      legacy.sqlite.exec(legacySql1())

      legacy.sqlite.exec(
        readFileSync(new URL('../migrations/0004_catalog_agent_repairs.sql', import.meta.url), 'utf8'),
      )
      legacy.sqlite.exec(
        readFileSync(new URL('../migrations/0005_catalog_cost_controls.sql', import.meta.url), 'utf8'),
      )

      expect(
        legacy.sqlite.prepare('SELECT evidence_runs, rationale FROM catalog_proposals').get(),
      ).toEqual({ evidence_runs: 1, rationale: 'original rationale' })
      expect(
        legacy.sqlite.prepare('SELECT memory_id, source FROM catalog_skips').all(),
      ).toEqual([
        { memory_id: 'explicit-memory', source: 'explicit' },
      ])
      expect(legacy.sqlite.prepare('SELECT interval_minutes FROM agent_settings').get())
        .toEqual({ interval_minutes: 60 })
      expect(
        legacy.sqlite.prepare(
          'SELECT max_batch, max_turns, daily_token_budget FROM agent_settings',
        ).get(),
      ).toEqual({ max_batch: 6, max_turns: 2, daily_token_budget: 100000 })
      expect(
        legacy.sqlite.prepare(

          'SELECT turns, tool_calls, prompt_tokens, completion_tokens, usage_missing_turns FROM catalog_runs',
        )

          .get(),
      )
        .toEqual(

          {
            turns: 1,
            tool_calls: 1,
            prompt_tokens: 123,
            completion_tokens: 45,
            usage_missing_turns: 0,
          },
        )
      expect(
        legacy.sqlite.prepare(

          'SELECT prompt_tokens, completion_tokens, usage_missing_turns FROM catalog_metrics_daily',
        )

          .get(),
      )
        .toEqual(

          { prompt_tokens: 123, completion_tokens: 45, usage_missing_turns: 0 },
        )
      expect(
        legacy.sqlite.prepare(
          'SELECT category_count, skipped_count, awaiting_review FROM catalog_state',
        ).get(),
      ).toEqual({ category_count: 1, skipped_count: 1, awaiting_review: 1 })
    }
    finally {
      legacy.sqlite.close()
    }
  },
)

it(
  'catalog schema > migrates BYO settings to Responses API without losing credentials or enablement',
  () => {
    const legacy = database({ through: '0005_catalog_cost_controls.sql' })
    try {
      seedLegacyProvider2(legacy)

      legacy.sqlite.exec(
        readFileSync(new URL('../migrations/0006_catalog_responses_api.sql', import.meta.url), 'utf8'),
      )

      expect(legacy.sqlite.prepare(
        `SELECT enabled, provider, base_url, model, api_key_ciphertext,
                api_key_iv, api_key_hint, include_content, daily_token_budget,
                last_probe_at, last_probe_ok, last_probe_error
         FROM agent_settings WHERE owner_id = 'alice'`,
      ).get()).toEqual({
        enabled: 1,
        provider: 'responses-api',
        base_url: 'https://api.example.com/v1',
        model: 'catalog-model',
        api_key_ciphertext: 'ciphertext',
        api_key_iv: 'iv',
        api_key_hint: 'hint',
        include_content: 1,
        daily_token_budget: 120000,
        last_probe_at: null,
        last_probe_ok: null,
        last_probe_error: null,
      })
      expect(() => legacy.sqlite.prepare(
        `INSERT INTO agent_settings(owner_id, provider, updated_at)
         VALUES ('old-client', 'openai-compatible', '2026-09-17T00:00:00.000Z')`,
      ).run()).toThrow()
    }
    finally {
      legacy.sqlite.close()
    }
  },
)

it(
  'catalog schema > rejects two depth-1 categories with the same slug for one owner',
  async () => {
    await insertCategory({ id: 'cat-a', slug: 'backend' })
    // SQLite treats NULLs as distinct in a UNIQUE constraint, so this is
    // enforced by a partial index rather than a table-level constraint.
    await expect(insertCategory({ id: 'cat-b', slug: 'backend' })).rejects.toThrow()
    // A different owner and a different parent are both still distinct.
    await insertCategory({ id: 'cat-c', ownerId: 'bob', slug: 'backend' })
    await insertCategory({ id: 'cat-d', parentId: 'cat-a', slug: 'backend' })
  },
)

it('catalog schema > ties depth to the presence of a parent', async () => {
  await expect(insertCategory({ id: 'cat-a', slug: 'root', depth: 2 })).rejects.toThrow()
  await insertCategory({ id: 'cat-b', slug: 'root' })
  await expect(
    insertCategory({ id: 'cat-c', parentId: 'cat-b', slug: 'child', depth: 1 }),
  ).rejects.toThrow()
})

it(
  'catalog schema > allows at most one primary category per memory',
  async () => {
    await insertCategory({ id: 'cat-a', slug: 'one' })
    await insertCategory({ id: 'cat-b', slug: 'two' })
    await fixture.env.DB.prepare(
      `INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint,
idempotency_key, search_text, created_at, updated_at)
       VALUES ('mem-1', 'alice', 'global', 'Test', 'Test', 'fact', '[]', 'Test', 'fp-1',
'key-1', 'test', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
    )
      .run()
    const assign = async (
      categoryId: string,
      isPrimary: number,
    ) =>
      await fixture.env.DB.prepare(
        ('INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, conf'

          + 'idence,\nassigned_by, catalog_version, created_at, updated_at)\n         VALUES (\''

          + 'alice\', \'mem-1\', ?, ?, 0.9, \'agent\', 1, \'2026-09-16T00:00:00.000Z\', \'2026-09-16T'

          + '00:00:00.000Z\')'),
      )
        .bind(

          categoryId,

          isPrimary,
        )
        .run()
    await assign('cat-a', 1)
    await expect(assign('cat-b', 1)).rejects.toThrow()
    // A second non-primary membership is what makes cross-cutting entries work.
    await assign('cat-b', 0)
  },
)

it(
  'catalog schema > keeps the action log as an idempotency journal',
  async () => {
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES ('run-1',
'alice', 'manual', 'live', 'running', '2026-09-16T00:00:00.000Z')`,
    )
      .run()
    const action = async () =>
      await fixture.env.DB.prepare(
        `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
arguments_json, decision, created_at)
         VALUES ('run-1', 'alice', 0, 1, 2, 'assign', 'assign', 'immediate', '{}', 'applied',
'2026-09-16T00:00:00.000Z')`,
      )
        .run()
    await action()
    // Replaying a step must collide so the retry returns the recorded result
    // instead of applying the effect twice.
    await expect(action()).rejects.toThrow()
  },
)
