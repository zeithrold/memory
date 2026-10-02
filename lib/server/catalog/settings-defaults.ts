import type { CatalogSettingsRow } from './settings-schema'
import {
  DEFAULT_DAILY_TOKEN_BUDGET,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_MAX_BATCH,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_MAX_TURNS,
} from './settings-schema'

/** Defaults used for an account that has never saved agent settings. */
export function defaultSettings(ownerId: string): CatalogSettingsRow {
  return {
    owner_id: ownerId,
    enabled: 0,
    provider: 'none',
    base_url: null,
    model: null,
    api_key_ciphertext: null,
    api_key_iv: null,
    api_key_hint: null,
    include_content: 0,
    interval_minutes: DEFAULT_INTERVAL_MINUTES,
    max_batch: DEFAULT_MAX_BATCH,
    max_turns: DEFAULT_MAX_TURNS,
    max_tool_calls: DEFAULT_MAX_TOOL_CALLS,
    daily_token_budget: DEFAULT_DAILY_TOKEN_BUDGET,
    auto_apply_structural: 0,
    dry_run_until_reviewed: 1,
    last_probe_at: null,
    last_probe_ok: null,
    last_probe_error: null,
    updated_at: '',
  }
}
