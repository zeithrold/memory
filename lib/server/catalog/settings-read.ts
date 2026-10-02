import type { Env } from '../env'
import type { Provider } from '../llm'
import type { CatalogRuntimeStatus, CatalogSettingsRow, CatalogSettingsView } from './settings-schema'
import {
  openSecret,
  settingsKeyConfigured,
} from '../secrets'
import { defaultSettings } from './settings-defaults'

export async function loadSettingsRow(
  env: Env,
  ownerId: string,
): Promise<CatalogSettingsRow | null> {
  return await env.DB.prepare('SELECT * FROM agent_settings WHERE owner_id = ?')
    .bind(ownerId)
    .first<CatalogSettingsRow>()
}

export function settingsView(
  row: CatalogSettingsRow | null,
  env: Env,
  status: CatalogRuntimeStatus = {
    awaitingReview: false,
    failureStreak: 0,
    todayTokens: 0,
    tokenUsageComplete: true,
  },
): CatalogSettingsView {
  const settings = row ?? defaultSettings('')
  const dailyTokenBudget = settings.daily_token_budget
  return {
    enabled: settings.enabled === 1,
    provider: settings.provider,
    baseUrl: settings.base_url ?? null,
    model: settings.model ?? null,
    hasApiKey: settings.api_key_ciphertext !== null,
    apiKeyHint: settings.api_key_hint ?? null,
    includeContent: settings.include_content === 1,
    intervalMinutes: settings.interval_minutes,
    maxBatch: settings.max_batch,
    maxTurns: settings.max_turns,
    maxToolCalls: settings.max_tool_calls,
    dailyTokenBudget,
    autoApplyStructural: settings.auto_apply_structural === 1,
    dryRunUntilReviewed: settings.dry_run_until_reviewed !== 0,
    awaitingReview: status.awaitingReview,
    failureStreak: status.failureStreak,
    todayTokens: status.todayTokens,
    tokenUsageComplete: status.tokenUsageComplete,
    budgetExceeded: status.todayTokens >= dailyTokenBudget,
    lastProbeAt: settings.last_probe_at ?? null,
    lastProbeOk: settings.last_probe_ok === null
      ? null
      : settings.last_probe_ok === 1,
    lastProbeError: settings.last_probe_error ?? null,
    canStoreKey: settingsKeyConfigured(env),
  }
}

export async function getCatalogSettings(
  env: Env,
  ownerId: string,
): Promise<CatalogSettingsView> {
  const [row, state, usage] = await Promise.all([
    loadSettingsRow(env, ownerId),
    env.DB.prepare(
      'SELECT awaiting_review, failure_streak FROM catalog_state WHERE owner_id = ?',
    )
      .bind(ownerId)
      .first<{ awaiting_review: number, failure_streak: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(sum(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS
tokens,
              sum(CASE WHEN prompt_tokens IS NULL OR completion_tokens IS NULL THEN 1 ELSE
0 END) AS missing
       FROM catalog_turns WHERE owner_id = ? AND substr(created_at, 1, 10) = ?`,
    )
      .bind(ownerId, now().slice(0, 10))
      .first<{ tokens: number, missing: number }>(),
  ])
  return settingsView(row, env, {
    awaitingReview: state?.awaiting_review === 1,
    failureStreak: state?.failure_streak ?? 0,
    todayTokens: usage?.tokens ?? 0,
    tokenUsageComplete: (usage?.missing ?? 0) === 0,
  })
}

export function allowLoopbackHttp(env: Env): boolean {
  // Mirrors the deployment's own origin rule: a local development origin may
  // talk to a local model server, a production origin may not.
  return env.APP_ORIGIN.startsWith('http:') || env.APP_ORIGIN.includes('localhost')
}

export function now(): string {
  return new Date().toISOString()
}

/**
 * Resolves the stored configuration into a usable provider, decrypting the
 * credential at the point of use. Callers inside a Workflow must call this in
 * the same step that performs the request: a decrypted key must never travel in
 * a step result.
 */
export async function providerForOwner(
  env: Env,
  ownerId: string,
): Promise<Provider> {
  const row = await loadSettingsRow(env, ownerId)
  if (!(row !== null) || row.provider === 'none' || row.model === null || row.model.length === 0) {
    return { kind: 'none' }
  }
  if (row.provider === 'workers-ai') {
    return { kind: 'workers-ai', model: row.model }
  }
  if (row.api_key_ciphertext === null || row.api_key_iv === null) {
    return { kind: 'none' }
  }
  return {
    kind: 'responses-api',
    model: row.model,
    baseUrl: row.base_url ?? '',
    apiKey: await openSecret(env, {
      ciphertext: row.api_key_ciphertext,
      iv: row.api_key_iv,
    }),
  }
}
