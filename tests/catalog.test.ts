import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../lib/server/errors'
import {
  openSecret,
  sealSecret,
  secretHint,
  settingsKeyConfigured,
} from '../lib/server/secrets'
import { database } from './database'

const MASTER_KEY = 'a'.repeat(64)
let env: Env
let store: ReturnType<typeof database>

beforeEach(() => {
  store = database()
  env = { DB: store.db, APP_ORIGIN: 'https://memory.example', AGENT_SETTINGS_KEY: MASTER_KEY }
})
afterEach(() => {
  store.sqlite.close()
})

interface CategoryInput {
  id: string
  ownerId?: string
  parentId?: string | null
  slug: string
  depth?: number
}
async function insertCategory(input: CategoryInput) {
  const depth = input.depth ?? (input.parentId == null ? 1 : 2)
  return env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(
      input.id,
      input.ownerId ?? 'alice',
      input.parentId ?? null,
      input.slug,
      input.slug,
      `${input.slug} description`,
      `NOT here: anything that is not ${input.slug}`,
      depth,
    )
    .run()
}

describe('catalog schema', () => {
  it('creates every catalog table', async () => {
    const rows = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'catalog%' OR name IN ('categories', 'memory_categories', 'agent_settings') ORDER BY name`,
    ).all<{ name: string }>()
    expect(rows.results.map(row => row.name)).toEqual([
      'agent_settings',
      'catalog_actions',
      'catalog_metrics_daily',
      'catalog_proposals',
      'catalog_runs',
      'catalog_skips',
      'catalog_state',
      'catalog_turns',
      'categories',
      'memory_categories',
    ])
  })
  it('rejects two depth-1 categories with the same slug for one owner', async () => {
    await insertCategory({ id: 'cat-a', slug: 'backend' })
    // SQLite treats NULLs as distinct in a UNIQUE constraint, so this is
    // enforced by a partial index rather than a table-level constraint.
    await expect(insertCategory({ id: 'cat-b', slug: 'backend' })).rejects.toThrow()
    // A different owner and a different parent are both still distinct.
    await insertCategory({ id: 'cat-c', ownerId: 'bob', slug: 'backend' })
    await insertCategory({ id: 'cat-d', parentId: 'cat-a', slug: 'backend' })
  })
  it('ties depth to the presence of a parent', async () => {
    await expect(insertCategory({ id: 'cat-a', slug: 'root', depth: 2 })).rejects.toThrow()
    await insertCategory({ id: 'cat-b', slug: 'root' })
    await expect(
      insertCategory({ id: 'cat-c', parentId: 'cat-b', slug: 'child', depth: 1 }),
    ).rejects.toThrow()
  })
  it('allows at most one primary category per memory', async () => {
    await insertCategory({ id: 'cat-a', slug: 'one' })
    await insertCategory({ id: 'cat-b', slug: 'two' })
    const assign = async (categoryId: string, isPrimary: number) =>
      env.DB.prepare(
        `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
         VALUES ('alice', 'mem-1', ?, ?, 0.9, 'agent', 1, '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
      )
        .bind(categoryId, isPrimary)
        .run()
    await assign('cat-a', 1)
    await expect(assign('cat-b', 1)).rejects.toThrow()
    // A second non-primary membership is what makes cross-cutting entries work.
    await assign('cat-b', 0)
  })
  it('keeps the action log as an idempotency journal', async () => {
    await env.DB.prepare(
      `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES ('run-1', 'alice', 'manual', 'live', 'running', '2026-09-16T00:00:00.000Z')`,
    ).run()
    const action = async () =>
      env.DB.prepare(
        `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, arguments_json, decision, created_at)
         VALUES ('run-1', 'alice', 0, 1, 2, 'assign', 'assign', 'immediate', '{}', 'applied', '2026-09-16T00:00:00.000Z')`,
      ).run()
    await action()
    // Replaying a step must collide so the retry returns the recorded result
    // instead of applying the effect twice.
    await expect(action()).rejects.toThrow()
  })
  it('keeps one row per conversation turn', async () => {
    await env.DB.prepare(
      `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES ('run-1', 'alice', 'manual', 'live', 'running', '2026-09-16T00:00:00.000Z')`,
    ).run()
    const turn = async () =>
      env.DB.prepare(
        `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, created_at) VALUES ('run-1', 'alice', 0, 0, 'reasoning', '2026-09-16T00:00:00.000Z')`,
      ).run()
    await turn()
    await expect(turn()).rejects.toThrow()
  })
  it('refuses an unknown provider and a non-boolean flag', async () => {
    const settings = async (provider: string, includeContent: number) =>
      env.DB.prepare(
        `INSERT INTO agent_settings(owner_id, provider, include_content, updated_at) VALUES ('alice', ?, ?, '2026-09-16T00:00:00.000Z')`,
      )
        .bind(provider, includeContent)
        .run()
    await settings('none', 0)
    await expect(settings('openai', 0)).rejects.toThrow()
    await expect(settings('github', 2)).rejects.toThrow()
  })
})

describe('model credential sealing', () => {
  it('round-trips a credential and keeps only a hint in the clear', async () => {
    const sealed = await sealSecret(env, 'sk-live-0123456789abcdef')
    expect(sealed.ciphertext).toMatch(/^[\da-f]+$/)
    expect(sealed.iv).toHaveLength(24)
    expect(sealed.hint).toBe('cdef')
    // The plaintext must not be recoverable from the stored columns alone.
    expect(JSON.stringify(sealed)).not.toContain('0123456789')
    expect(await openSecret(env, sealed)).toBe('sk-live-0123456789abcdef')
  })
  it('produces a distinct ciphertext per call for the same plaintext', async () => {
    const first = await sealSecret(env, 'sk-same')
    const second = await sealSecret(env, 'sk-same')
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })
  it('fails closed when the deployment has no master key', async () => {
    const bare: Env = { DB: store.db, APP_ORIGIN: 'https://memory.example' }
    expect(settingsKeyConfigured(bare)).toBe(false)
    await expect(sealSecret(bare, 'sk-live')).rejects.toThrow(AppError)
    await expect(sealSecret(bare, 'sk-live')).rejects.toThrow(/AGENT_SETTINGS_KEY/)
  })
  it('rejects a malformed master key instead of deriving a weak one', async () => {
    for (const value of ['', 'short', 'z'.repeat(64), 'a'.repeat(62)]) {
      const broken: Env = { ...env, AGENT_SETTINGS_KEY: value }
      expect(settingsKeyConfigured(broken)).toBe(false)
      await expect(sealSecret(broken, 'sk-live')).rejects.toThrow(/AGENT_SETTINGS_KEY/)
    }
  })
  it('refuses to decrypt under a different master key', async () => {
    const sealed = await sealSecret(env, 'sk-live-0123456789abcdef')
    const rotated: Env = { ...env, AGENT_SETTINGS_KEY: 'b'.repeat(64) }
    await expect(openSecret(rotated, sealed)).rejects.toThrow(/could not be decrypted/)
  })
  it('refuses to decrypt a tampered ciphertext', async () => {
    const sealed = await sealSecret(env, 'sk-live-0123456789abcdef')
    const flipped = sealed.ciphertext.startsWith('0') ? '1' : '0'
    await expect(
      openSecret(env, { ...sealed, ciphertext: flipped + sealed.ciphertext.slice(1) }),
    ).rejects.toThrow(/could not be decrypted/)
  })
  it('hints a short credential without revealing it whole', () => {
    expect(secretHint('abcdef')).toBe('cdef')
    expect(secretHint('abcdef')).not.toBe('abcdef')
  })
})
