import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkTenantIntegrity } from '../lib/server/tenant-integrity'
import { database } from './database'

function remapSql(oldOwner: string, newOwner: string): string {
  return readFileSync(new URL('../scripts/remap-owner-id.sql', import.meta.url), 'utf8')
    .replace('user_REPLACE_OLD_OWNER_ID', oldOwner)
    .replace('00000000-0000-0000-0000-000000000000', newOwner)
}

describe('owner_id remap script', () => {
  it('remaps every tenant table without colliding on revisions', async () => {
    const store = database()
    const { db, sqlite } = store
    const now = '2026-09-18T00:00:00.000Z'
    sqlite.exec(`
      INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint, idempotency_key, search_text, version, deleted, created_at, updated_at)
      VALUES ('mem-1', 'user_old', 'global', 'Title', 'Body', 'fact', '[]', 'src', 'fp1', 'idem-1', 'title body', 1, 0, '${now}', '${now}');
      INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, created_at, expires_at)
      VALUES ('tok-1', 'user_old', 't', 'digest', 'mem_abc', '["memory:read"]', '${now}', '2099-01-01T00:00:00.000Z');
      INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, created_by, created_at, updated_at)
      VALUES ('cat-1', 'user_old', NULL, 'root', 'Root', 'd', 'b', 1, 'user', '${now}', '${now}');
      INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
      VALUES ('user_old', 'mem-1', 'cat-1', 1, 0.9, 'user', 1, '${now}', '${now}');
      INSERT INTO catalog_state(owner_id, version) VALUES ('user_old', 1);
      INSERT INTO agent_settings(owner_id, provider, updated_at) VALUES ('user_old', 'none', '${now}');
      INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at)
      VALUES ('run-1', 'user_old', 'manual', 'live', 'succeeded', '${now}');
      INSERT INTO catalog_turns(run_id, owner_id, batch, turn, created_at)
      VALUES ('run-1', 'user_old', 1, 1, '${now}');
      INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, arguments_json, decision, created_at)
      VALUES ('run-1', 'user_old', 1, 1, 1, 'x', 'x', 'read', '{}', 'applied', '${now}');
      INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, payload_json, status, created_at)
      VALUES ('prop-1', 'user_old', 'run-1', 'run-1', 'create_category', '{}', 'pending', '${now}');
      INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at)
      VALUES ('user_old', 'mem-1', 'x', 1, 0, '${now}');
      INSERT INTO catalog_memory_reviews(owner_id, memory_id, memory_version, reviewed_at)
      VALUES ('user_old', 'mem-1', 1, '${now}');
      INSERT INTO catalog_metrics_daily(owner_id, day, runs) VALUES ('user_old', '2026-09-18', 1);
      INSERT INTO usage_events(id, owner_id, token_id, operation, status, duration_ms, created_at)
      VALUES ('usage-1', 'user_old', 'tok-1', 'GET memories', 200, 1, '${now}');
    `)
    const revisionsBefore = sqlite.prepare('SELECT count(*) AS n FROM revisions').get() as { n: number }
    const jobsBefore = sqlite.prepare('SELECT count(*) AS n FROM index_jobs').get() as { n: number }

    sqlite.exec(remapSql('user_old', '7335d417-61da-459d-899c-0a01c76a2f94'))

    expect(sqlite.prepare('SELECT owner_id FROM memories').get()).toEqual({
      owner_id: '7335d417-61da-459d-899c-0a01c76a2f94',
    })
    expect(sqlite.prepare('SELECT owner_id FROM api_tokens').get()).toEqual({
      owner_id: '7335d417-61da-459d-899c-0a01c76a2f94',
    })
    expect(sqlite.prepare('SELECT owner_id FROM agent_settings').get()).toEqual({
      owner_id: '7335d417-61da-459d-899c-0a01c76a2f94',
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM revisions').get()).toEqual(revisionsBefore)
    const jobsAfter = sqlite.prepare('SELECT count(*) AS n FROM index_jobs').get() as { n: number }
    expect(jobsAfter.n).toBeGreaterThanOrEqual(jobsBefore.n)
    expect(await checkTenantIntegrity(db)).toEqual([])

    sqlite.exec(remapSql('user_old', '7335d417-61da-459d-899c-0a01c76a2f94'))
    expect(sqlite.prepare('SELECT owner_id FROM memories').get()).toEqual({
      owner_id: '7335d417-61da-459d-899c-0a01c76a2f94',
    })
    expect(await checkTenantIntegrity(db)).toEqual([])
    store.sqlite.close()
  })
})
