import type { z } from 'zod'
import type { Env } from '../env'
import type { CatalogSettingsRow, settingsInputSchema } from './settings-schema'
import { AppError } from '../errors'
import { normalizeBaseUrl } from '../llm'
import { sealSecret, settingsKeyConfigured } from '../secrets'
import { allowLoopbackHttp } from './settings-read'

export type SettingsInput = z.infer<typeof settingsInputSchema>

function connectionFields(current: CatalogSettingsRow, input: SettingsInput): Pick<
  CatalogSettingsRow,
'provider' | 'base_url' | 'model'
> {
  return {
    provider: input.provider ?? current.provider,
    base_url: input.baseUrl ?? current.base_url,
    model: input.model ?? current.model,
  }
}

function budgetFields(current: CatalogSettingsRow, input: SettingsInput): Pick<
  CatalogSettingsRow,
'max_batch' | 'max_turns' | 'max_tool_calls' | 'daily_token_budget' | 'interval_minutes'
> {
  return {
    max_batch: input.maxBatch ?? current.max_batch,
    max_turns: input.maxTurns ?? current.max_turns,
    max_tool_calls: input.maxToolCalls ?? current.max_tool_calls,
    daily_token_budget: input.dailyTokenBudget ?? current.daily_token_budget,
    interval_minutes: input.intervalMinutes ?? current.interval_minutes,
  }
}

function policyFields(
  current: CatalogSettingsRow,
  input: SettingsInput,
): Pick<
  CatalogSettingsRow,
'enabled' | 'include_content' | 'auto_apply_structural' | 'dry_run_until_reviewed'
> {
  return {
    enabled: (input.enabled ?? current.enabled === 1) ? 1 : 0,
    include_content: (input.includeContent ?? current.include_content === 1) ? 1 : 0,
    auto_apply_structural: (input.autoApplyStructural ?? current.auto_apply_structural === 1) ? 1 : 0,
    dry_run_until_reviewed: (input.dryRunUntilReviewed ?? current.dry_run_until_reviewed !== 0) ? 1 : 0,
  }
}

async function credentialFields(
  env: Env,
  current: CatalogSettingsRow,
  input: SettingsInput,
): Promise<Pick<
  CatalogSettingsRow,
'api_key_ciphertext' | 'api_key_iv' | 'api_key_hint'
>> {
  if (input.apiKey !== undefined) {
    // Fail closed rather than degrading to a plaintext column.
    if (!settingsKeyConfigured(env)) {
      throw new AppError(
        'AGENT_KEY_UNCONFIGURED',
        'This deployment has no AGENT_SETTINGS_KEY, so a credential cannot be stored.',
      )
    }
    const sealed = await sealSecret(env, input.apiKey)
    return {
      api_key_ciphertext: sealed.ciphertext,
      api_key_iv: sealed.iv,
      api_key_hint: sealed.hint,
    }
  }
  if (input.clearApiKey === true) {
    return { api_key_ciphertext: null, api_key_iv: null, api_key_hint: null }
  }
  return {
    api_key_ciphertext: current.api_key_ciphertext,
    api_key_iv: current.api_key_iv,
    api_key_hint: current.api_key_hint,
  }
}

function probeInvalidated(
  current: CatalogSettingsRow,
  next: CatalogSettingsRow,
  input: SettingsInput,
): boolean {
  return input.apiKey !== undefined
    || input.clearApiKey === true
    || (input.provider !== undefined && input.provider !== current.provider)
    || (input.baseUrl !== undefined && next.base_url !== current.base_url)
    || (input.model !== undefined && next.model !== current.model)
}

export async function mergeSettings(
  env: Env,
  current: CatalogSettingsRow,
  input: SettingsInput,
): Promise<CatalogSettingsRow> {
  const next = {
    ...current,
    ...connectionFields(current, input),
    ...budgetFields(current, input),
    ...policyFields(current, input),
  }
  if (next.provider === 'responses-api' && next.base_url !== null) {
    next.base_url = normalizeBaseUrl(next.base_url, allowLoopbackHttp(env))
  }
  Object.assign(next, await credentialFields(env, current, input))
  if (probeInvalidated(current, next, input)) {
    next.last_probe_at = null
    next.last_probe_ok = null
    next.last_probe_error = null
  }
  return next
}

export function validateSettings(
  settings: CatalogSettingsRow,
): void {
  if (settings.max_batch > settings.max_tool_calls - 2) {
    throw new AppError(
      'INVALID_INPUT',
      'Memories per batch must be at least two below the per-turn tool-call budget.',
    )
  }
  if (settings.enabled !== 1) {
    return
  }
  if (settings.provider === 'none') {
    throw new AppError(
      'INVALID_INPUT',
      'Choose a model provider before enabling scheduled catalog maintenance.',
    )
  }
  if (settings.model === null || settings.model.length === 0) {
    throw new AppError('INVALID_INPUT', 'A model name is required before enabling the catalog agent.')
  }
  if (settings.provider === 'responses-api') {
    if (settings.base_url === null || settings.base_url.length === 0) {
      throw new AppError('INVALID_INPUT', 'An endpoint URL is required for a Responses API provider.')
    }
    if (settings.api_key_ciphertext === null) {
      throw new AppError('INVALID_INPUT', 'An API key is required for a Responses API provider.')
    }
  }
}
