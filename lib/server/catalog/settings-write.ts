import type { Env } from '../env'
import type { CatalogSettingsRow, CatalogSettingsView } from './settings-schema'
import { defaultSettings } from './settings-defaults'
import { mergeSettings, validateSettings } from './settings-merge'
import { getCatalogSettings, loadSettingsRow, now } from './settings-read'
import { settingsInputSchema } from './settings-schema'

/** Omitted fields retain their stored value, including the write-only credential. */
export async function updateCatalogSettings(
  env: Env,
  ownerId: string,
  value: unknown,
): Promise<CatalogSettingsView> {
  const input = settingsInputSchema.parse(value)
  const current = await loadSettingsRow(env, ownerId) ?? defaultSettings(ownerId)
  const next = await mergeSettings(env, current, input)
  validateSettings(next)
  await persistSettings(env, next)
  // Acknowledging the preview gate allows a new preview or resumes live runs.
  const reviewGateChanged = input.dryRunUntilReviewed !== undefined
    && input.dryRunUntilReviewed !== (current.dry_run_until_reviewed !== 0)
  if (reviewGateChanged) {
    await env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, awaiting_review)
       VALUES (?, 1, 0)
       ON CONFLICT(owner_id) DO UPDATE SET awaiting_review = 0`,
    ).bind(ownerId).run()
  }
  return await getCatalogSettings(env, ownerId)
}

async function persistSettings(
  env: Env,
  row: CatalogSettingsRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO agent_settings(
       owner_id, enabled, provider, base_url, model, api_key_ciphertext, api_key_iv, api_key_hint,
       include_content, interval_minutes, max_batch, max_turns, max_tool_calls, daily_token_budget,
       auto_apply_structural, dry_run_until_reviewed, last_probe_at, last_probe_ok, last_probe_error,
updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       enabled = excluded.enabled,
       provider = excluded.provider,
       base_url = excluded.base_url,
       model = excluded.model,
       api_key_ciphertext = excluded.api_key_ciphertext,
       api_key_iv = excluded.api_key_iv,
       api_key_hint = excluded.api_key_hint,
       include_content = excluded.include_content,
       interval_minutes = excluded.interval_minutes,
       max_batch = excluded.max_batch,
       max_turns = excluded.max_turns,
       max_tool_calls = excluded.max_tool_calls,
       daily_token_budget = excluded.daily_token_budget,
       auto_apply_structural = excluded.auto_apply_structural,
       dry_run_until_reviewed = excluded.dry_run_until_reviewed,
       last_probe_at = excluded.last_probe_at,
       last_probe_ok = excluded.last_probe_ok,
       last_probe_error = excluded.last_probe_error,
       updated_at = excluded.updated_at`,
  )

    .bind(
      ...settingsValues(row),
    )
    .run()
}

function settingsValues(row: CatalogSettingsRow): (string | number | null)[] {
  return [
    row.owner_id,
    row.enabled,
    row.provider,
    row.base_url,
    row.model,
    row.api_key_ciphertext,
    row.api_key_iv,
    row.api_key_hint,
    row.include_content,
    row.interval_minutes,
    row.max_batch,
    row.max_turns,
    row.max_tool_calls,
    row.daily_token_budget,
    row.auto_apply_structural,
    row.dry_run_until_reviewed,
    row.last_probe_at,
    row.last_probe_ok,
    row.last_probe_error,
    now(),
  ]
}

/**
 * Records the outcome of a probe of the stored configuration.
 *
 * Only a failure keeps its explanation: the column is `last_probe_error`, and
 * storing a success message in it would make the name a lie. Success is already
 * carried by `last_probe_ok`, and the form shows the detail of the probe it just
 * ran.
 */
export async function recordProbe(
  env: Env,
  ownerId: string,
  result: { ok: boolean, detail: string },
): Promise<void> {
  await env.DB.prepare(
    ('UPDATE agent_settings SET last_probe_at = ?, last_probe_ok = ?, '
      + 'last_probe_error = ?, updated_at = ? WHERE owner_id = ?'),
  )
    .bind(
      now(),
      result.ok ? 1 : 0,
      result.ok ? null : result.detail.slice(0, 500),
      now(),
      ownerId,
    )
    .run()
}
