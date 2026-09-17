import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkTenantIntegrity } from '../lib/server/tenant-integrity'
import { database } from './database'

let store: ReturnType<typeof database>
let env: Env

beforeEach(() => {
  store = database()
  env = { DB: store.db, APP_ORIGIN: 'https://memory.example' }
  store.sqlite.exec(`
    INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint, idempotency_key, search_text, created_at, updated_at) VALUES
      ('mem-a', 'alice', 'global', 'A', 'A', 'fact', '[]', 'test', 'fp-a', 'key-a', 'a', '2026-09-17', '2026-09-17'),
      ('mem-b', 'bob', 'global', 'B', 'B', 'fact', '[]', 'test', 'fp-b', 'key-b', 'b', '2026-09-17', '2026-09-17');
    INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, created_by, created_at, updated_at) VALUES
      ('cat-a', 'alice', NULL, 'a', 'A', 'A', 'not B', 1, 'user', '2026-09-17', '2026-09-17'),
      ('cat-b', 'bob', NULL, 'b', 'B', 'B', 'not A', 1, 'user', '2026-09-17', '2026-09-17');
    INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES
      ('run-a', 'alice', 'manual', 'live', 'running', '2026-09-17'),
      ('run-b', 'bob', 'manual', 'live', 'running', '2026-09-17');
    INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, created_at, expires_at) VALUES
      ('token-a', 'alice', 'A', 'digest-a', 'mem_a', '["memory:read"]', '2026-09-17', '2099-01-01'),
      ('token-b', 'bob', 'B', 'digest-b', 'mem_b', '["memory:read"]', '2026-09-17', '2099-01-01');
  `)
})
afterEach(() => store.sqlite.close())

describe('tenant integrity migration', () => {
  it.each([
    ['category parent', `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, created_by, created_at, updated_at) VALUES ('child-x', 'alice', 'cat-b', 'x', 'X', 'X', 'X', 2, 'user', '2026-09-17', '2026-09-17')`],
    ['membership memory', `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at) VALUES ('alice', 'mem-b', 'cat-a', 1, .9, 'user', 1, '2026-09-17', '2026-09-17')`],
    ['membership category', `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at) VALUES ('alice', 'mem-a', 'cat-b', 1, .9, 'user', 1, '2026-09-17', '2026-09-17')`],
    ['catalog turn', `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, created_at) VALUES ('run-b', 'alice', 1, 1, '2026-09-17')`],
    ['catalog action', `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, arguments_json, decision, created_at) VALUES ('run-b', 'alice', 1, 1, 1, 'x', 'x', 'read', '{}', 'applied', '2026-09-17')`],
    ['skip', `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at) VALUES ('alice', 'mem-b', 'x', 1, 0, '2026-09-17')`],
    ['review', `INSERT INTO catalog_memory_reviews(owner_id, memory_id, memory_version, reviewed_at) VALUES ('alice', 'mem-b', 1, '2026-09-17')`],
    ['legacy usage', `INSERT INTO usage_events(id, owner_id, token_id, operation, status, duration_ms, created_at) VALUES ('usage-x', 'alice', 'token-b', 'GET memories', 200, 1, '2026-09-17')`],
  ])('rejects cross-owner %s inserts', async (_name, sql) => {
    await expect(env.DB.prepare(sql).run()).rejects.toThrow(/tenant_integrity/)
  })

  it.each(['memories', 'categories', 'catalog_runs', 'api_tokens'])('makes %s owner immutable', async (table) => {
    const id = table === 'memories' ? 'mem-a' : table === 'categories' ? 'cat-a' : table === 'catalog_runs' ? 'run-a' : 'token-a'
    await expect(env.DB.prepare(`UPDATE ${table} SET owner_id = 'bob' WHERE id = ?`).bind(id).run()).rejects.toThrow(/tenant_integrity/)
  })

  it('allows same-owner relationships and audit category ids to dangle later', async () => {
    await expect(env.DB.prepare(
      `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at) VALUES ('alice', 'mem-a', 'cat-a', 1, .9, 'user', 1, '2026-09-17', '2026-09-17')`,
    ).run()).resolves.toMatchObject({ success: true })
    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, category_id, arguments_json, decision, created_at) VALUES ('run-a', 'alice', 1, 1, 1, 'x', 'x', 'read', 'historical-category', '{}', 'applied', '2026-09-17')`,
    ).run()
    expect(await checkTenantIntegrity(env.DB)).toEqual([])
  })

  it('finds legacy dirty data without modifying it', async () => {
    const legacy = database({ through: '0006_catalog_responses_api.sql' })
    try {
      legacy.sqlite.exec(`
        INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint, idempotency_key, search_text, created_at, updated_at)
        VALUES ('mem-b', 'bob', 'global', 'B', 'B', 'fact', '[]', 'test', 'fp-b', 'key-b', 'b', '2026-09-17', '2026-09-17');
        INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, created_by, created_at, updated_at)
        VALUES ('cat-a', 'alice', NULL, 'a', 'A', 'A', 'A', 1, 'user', '2026-09-17', '2026-09-17');
        INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
        VALUES ('alice', 'mem-b', 'cat-a', 1, .9, 'user', 1, '2026-09-17', '2026-09-17');
      `)
      expect(await checkTenantIntegrity(legacy.db)).toEqual([
        expect.objectContaining({ relationship: 'memory_categories.memory', count: 1 }),
      ])
      expect(legacy.sqlite.prepare('SELECT count(*) AS n FROM memory_categories').get()).toEqual({ n: 1 })
    }
    finally {
      legacy.sqlite.close()
    }
  })
})
