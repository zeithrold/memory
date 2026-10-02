import type { Env } from '../lib/server/env'
import { expect, it } from 'vitest'
import { AppError } from '../lib/server/errors'
import {
  openSecret,
  sealSecret,
  secretHint,
  settingsKeyConfigured,
} from '../lib/server/secrets'
import { fixture } from './catalog-fixture'

it(
  'catalog schema > keeps one row per conversation turn',
  async () => {
    await fixture.env.DB.prepare(
      `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, started_at) VALUES ('run-1',
'alice', 'manual', 'live', 'running', '2026-09-16T00:00:00.000Z')`,
    )
      .run()
    const turn = async () =>
      await fixture.env.DB.prepare(
        `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, created_at) VALUES ('run-1',
'alice', 0, 0, 'reasoning', '2026-09-16T00:00:00.000Z')`,
      )
        .run()
    await turn()
    await expect(turn()).rejects.toThrow()
  },
)

it(
  'catalog schema > refuses an unknown provider and a non-boolean flag',
  async () => {
    const settings = async (
      provider: string,
      includeContent: number,
    ) =>
      await fixture.env.DB.prepare(
        `INSERT INTO agent_settings(owner_id, provider, include_content, updated_at) VALUES ('alice',
?, ?, '2026-09-16T00:00:00.000Z')`,
      )
        .bind(

          provider,

          includeContent,
        )
        .run()
    await settings('none', 0)
    await expect(settings('openai', 0)).rejects.toThrow()
    await expect(settings('github', 2)).rejects.toThrow()
  },
)

it(
  'model credential sealing > round-trips a credential and keeps only a hint in the clear',
  async () => {
    const sealed = await sealSecret(fixture.env, 'sk-live-0123456789abcdef')
    expect(sealed.ciphertext).toMatch(/^[\da-f]+$/)
    expect(sealed.iv).toHaveLength(24)
    expect(sealed.hint).toBe('cdef')
    // The plaintext must not be recoverable from the stored columns alone.
    expect(JSON.stringify(sealed)).not.toContain('0123456789')
    expect(await openSecret(fixture.env, sealed)).toBe('sk-live-0123456789abcdef')
  },
)

it(
  'model credential sealing > produces a distinct ciphertext per call for the same plaintext',
  async () => {
    const first = await sealSecret(fixture.env, 'sk-same')
    const second = await sealSecret(fixture.env, 'sk-same')
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  },
)

it(
  'model credential sealing > fails closed when the deployment has no master key',
  async () => {
    const bare: Env = { DB: fixture.store.db, APP_ORIGIN: 'https://memory.example' }
    expect(settingsKeyConfigured(bare)).toBe(false)
    await expect(sealSecret(bare, 'sk-live')).rejects.toThrow(AppError)
    await expect(sealSecret(bare, 'sk-live')).rejects.toThrow(/AGENT_SETTINGS_KEY/)
  },
)

it(
  'model credential sealing > rejects a malformed master key instead of deriving a weak one',
  async () => {
    for (const value of [
      '',
      'short',
      'z'.repeat(64),
      'a'.repeat(62),
    ]) {
      const broken: Env = { ...fixture.env, AGENT_SETTINGS_KEY: value }
      expect(settingsKeyConfigured(broken)).toBe(false)
      await expect(sealSecret(broken, 'sk-live')).rejects.toThrow(/AGENT_SETTINGS_KEY/)
    }
  },
)

it('model credential sealing > refuses to decrypt under a different master key', async () => {
  const sealed = await sealSecret(fixture.env, 'sk-live-0123456789abcdef')
  const rotated: Env = { ...fixture.env, AGENT_SETTINGS_KEY: 'b'.repeat(64) }
  await expect(openSecret(rotated, sealed)).rejects.toThrow(/could not be decrypted/)
})

it('model credential sealing > refuses to decrypt a tampered ciphertext', async () => {
  const sealed = await sealSecret(fixture.env, 'sk-live-0123456789abcdef')
  const flipped = sealed.ciphertext.startsWith('0') ? '1' : '0'
  await expect(
    openSecret(fixture.env, { ...sealed, ciphertext: flipped + sealed.ciphertext.slice(1) }),
  ).rejects.toThrow(/could not be decrypted/)
})

it('model credential sealing > hints a short credential without revealing it whole', () => {
  expect(secretHint('abcdef')).toBe('cdef')
  expect(secretHint('abcdef')).not.toBe('abcdef')
})
