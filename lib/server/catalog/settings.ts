import type { Env } from '../env'
import type { Provider } from '../llm'
import { z } from 'zod'
import { AppError } from '../errors'
import { normalizeBaseUrl } from '../llm'
import {
  openSecret,
  sealSecret,
  settingsKeyConfigured,
} from '../secrets'

/**
 * Per-account model configuration.
 *
 * The credential is write-only from the API's point of view: it goes in, and
 * only a hint comes back. Nothing here returns `api_key_ciphertext` to a
 * client, and the plaintext is never placed in a Workflow step result, because
 * step results are persisted as instance state.
 */
export const providerKinds = ['none', 'responses-api', 'workers-ai'] as const
export type ProviderKind = (typeof providerKinds)[number]

export const settingsInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: z.enum(providerKinds).optional(),
    baseUrl: z.string().trim().max(500).optional(),
    model: z.string().trim().max(200).optional(),
    /** Omit to keep the stored credential; `clearApiKey` removes it. */
    apiKey: z.string().trim().min(8).max(4096).optional(),
    clearApiKey: z.boolean().optional(),
    includeContent: z.boolean().optional(),
    intervalMinutes: z.number().int().min(30).max(1440).refine(value => value % 30 === 0, 'Run interval must be a multiple of 30 minutes.').optional(),
    maxBatch: z.number().int().min(1).max(25).optional(),
    maxTurns: z.number().int().min(1).max(8).optional(),
    maxToolCalls: z.number().int().min(3).max(24).optional(),
    dailyTokenBudget: z.number().int().min(10000).max(5000000).optional(),
    autoApplyStructural: z.boolean().optional(),
    dryRunUntilReviewed: z.boolean().optional(),
  })
  .strict()

export interface CatalogSettingsRow {
  owner_id: string
  enabled: number
  provider: ProviderKind
  base_url: string | null
  model: string | null
  api_key_ciphertext: string | null
  api_key_iv: string | null
  api_key_hint: string | null
  include_content: number
  interval_minutes: number
  max_batch: number
  max_turns: number
  max_tool_calls: number
  daily_token_budget: number
  auto_apply_structural: number
  dry_run_until_reviewed: number
  last_probe_at: string | null
  last_probe_ok: number | null
  last_probe_error: string | null
  updated_at: string
}

/** The shape the browser receives. Never carries the ciphertext or the key. */
export interface CatalogSettingsView {
  enabled: boolean
  provider: ProviderKind
  baseUrl: string | null
  model: string | null
  hasApiKey: boolean
  apiKeyHint: string | null
  includeContent: boolean
  intervalMinutes: number
  maxBatch: number
  maxTurns: number
  maxToolCalls: number
  dailyTokenBudget: number
  autoApplyStructural: boolean
  dryRunUntilReviewed: boolean
  awaitingReview: boolean
  failureStreak: number
  todayTokens: number
  tokenUsageComplete: boolean
  budgetExceeded: boolean
  lastProbeAt: string | null
  lastProbeOk: boolean | null
  lastProbeError: string | null
  /** Whether this deployment can hold a credential at all. */
  canStoreKey: boolean
}

const DEFAULT_INTERVAL_MINUTES = 30
/**
 * Conservative Free-plan defaults: every conversation turn costs two Workflow
 * steps against a 3,000-step daily allowance, and each step has a 10 ms CPU
 * budget, so batches stay small until a user raises them.
 */
const DEFAULT_MAX_BATCH = 6
const DEFAULT_MAX_TURNS = 2
const DEFAULT_MAX_TOOL_CALLS = 8
const DEFAULT_DAILY_TOKEN_BUDGET = 100000

export async function loadSettingsRow(
  env: Env,
  ownerId: string,
): Promise<CatalogSettingsRow | null> {
  return env.DB.prepare('SELECT * FROM agent_settings WHERE owner_id = ?')
    .bind(ownerId)
    .first<CatalogSettingsRow>()
}

interface CatalogRuntimeStatus {
  awaitingReview: boolean
  failureStreak: number
  todayTokens: number
  tokenUsageComplete: boolean
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
  const dailyTokenBudget = row?.daily_token_budget ?? DEFAULT_DAILY_TOKEN_BUDGET
  return {
    enabled: row?.enabled === 1,
    provider: row?.provider ?? 'none',
    baseUrl: row?.base_url ?? null,
    model: row?.model ?? null,
    hasApiKey: row?.api_key_ciphertext !== null && row?.api_key_ciphertext !== undefined,
    apiKeyHint: row?.api_key_hint ?? null,
    includeContent: row?.include_content === 1,
    intervalMinutes: row?.interval_minutes ?? DEFAULT_INTERVAL_MINUTES,
    maxBatch: row?.max_batch ?? DEFAULT_MAX_BATCH,
    maxTurns: row?.max_turns ?? DEFAULT_MAX_TURNS,
    maxToolCalls: row?.max_tool_calls ?? DEFAULT_MAX_TOOL_CALLS,
    dailyTokenBudget,
    autoApplyStructural: row?.auto_apply_structural === 1,
    dryRunUntilReviewed: row?.dry_run_until_reviewed !== 0,
    awaitingReview: status.awaitingReview,
    failureStreak: status.failureStreak,
    todayTokens: status.todayTokens,
    tokenUsageComplete: status.tokenUsageComplete,
    budgetExceeded: status.todayTokens >= dailyTokenBudget,
    lastProbeAt: row?.last_probe_at ?? null,
    lastProbeOk: row?.last_probe_ok === null || row?.last_probe_ok === undefined
      ? null
      : row.last_probe_ok === 1,
    lastProbeError: row?.last_probe_error ?? null,
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
      `SELECT COALESCE(sum(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS tokens,
              sum(CASE WHEN prompt_tokens IS NULL OR completion_tokens IS NULL THEN 1 ELSE 0 END) AS missing
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

function allowLoopbackHttp(env: Env): boolean {
  // Mirrors the deployment's own origin rule: a local development origin may
  // talk to a local model server, a production origin may not.
  return env.APP_ORIGIN.startsWith('http:') || env.APP_ORIGIN.includes('localhost')
}

function now(): string {
  return new Date().toISOString()
}

/**
 * Merges a partial update onto the stored row. Omitted fields keep their value,
 * so a form that never re-sends the credential cannot silently erase it.
 */
export async function updateCatalogSettings(
  env: Env,
  ownerId: string,
  value: unknown,
): Promise<CatalogSettingsView> {
  const input = settingsInputSchema.parse(value)
  const current = await loadSettingsRow(env, ownerId)

  const provider = input.provider ?? current?.provider ?? 'none'
  let baseUrl = input.baseUrl ?? current?.base_url ?? null
  const model = input.model ?? current?.model ?? null
  let ciphertext = current?.api_key_ciphertext ?? null
  let iv = current?.api_key_iv ?? null
  let hint = current?.api_key_hint ?? null

  if (provider === 'responses-api' && baseUrl !== null)
    baseUrl = normalizeBaseUrl(baseUrl, allowLoopbackHttp(env))

  if (input.clearApiKey === true) {
    ciphertext = null
    iv = null
    hint = null
  }
  if (input.apiKey !== undefined) {
    if (!settingsKeyConfigured(env)) {
      // Fail closed rather than degrading to a plaintext column.
      throw new AppError(
        'AGENT_KEY_UNCONFIGURED',
        'This deployment has no AGENT_SETTINGS_KEY, so a credential cannot be stored.',
      )
    }
    const sealed = await sealSecret(env, input.apiKey)
    ciphertext = sealed.ciphertext
    iv = sealed.iv
    hint = sealed.hint
  }

  const enabled = input.enabled ?? current?.enabled === 1
  const maxBatch = input.maxBatch ?? current?.max_batch ?? DEFAULT_MAX_BATCH
  const maxTurns = input.maxTurns ?? current?.max_turns ?? DEFAULT_MAX_TURNS
  const maxToolCalls = input.maxToolCalls ?? current?.max_tool_calls ?? DEFAULT_MAX_TOOL_CALLS
  const dailyTokenBudget = input.dailyTokenBudget
    ?? current?.daily_token_budget
    ?? DEFAULT_DAILY_TOKEN_BUDGET
  const probeInvalidated = input.apiKey !== undefined
    || input.clearApiKey === true
    || (input.provider !== undefined && input.provider !== current?.provider)
    || (input.baseUrl !== undefined && baseUrl !== current?.base_url)
    || (input.model !== undefined && model !== current?.model)
  if (maxBatch > maxToolCalls - 2) {
    throw new AppError(
      'INVALID_INPUT',
      'Memories per batch must be at least two below the per-turn tool-call budget.',
    )
  }
  if (enabled) {
    if (provider === 'none') {
      throw new AppError(
        'INVALID_INPUT',
        'Choose a model provider before enabling scheduled catalog maintenance.',
      )
    }
    if (model === null || model.length === 0) {
      throw new AppError('INVALID_INPUT', 'A model name is required before enabling the catalog agent.')
    }
    if (provider === 'responses-api') {
      if (baseUrl === null || baseUrl.length === 0) {
        throw new AppError('INVALID_INPUT', 'An endpoint URL is required for a Responses API provider.')
      }
      if (ciphertext === null) {
        throw new AppError('INVALID_INPUT', 'An API key is required for a Responses API provider.')
      }
    }
  }

  const timestamp = now()
  await env.DB.prepare(
    `INSERT INTO agent_settings(
       owner_id, enabled, provider, base_url, model, api_key_ciphertext, api_key_iv, api_key_hint,
       include_content, interval_minutes, max_batch, max_turns, max_tool_calls, daily_token_budget,
       auto_apply_structural, dry_run_until_reviewed, last_probe_at, last_probe_ok, last_probe_error, updated_at
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
      ownerId,
      enabled ? 1 : 0,
      provider,
      baseUrl,
      model,
      ciphertext,
      iv,
      hint,
      (input.includeContent ?? current?.include_content === 1) ? 1 : 0,
      input.intervalMinutes ?? current?.interval_minutes ?? DEFAULT_INTERVAL_MINUTES,
      maxBatch,
      maxTurns,
      maxToolCalls,
      dailyTokenBudget,
      (input.autoApplyStructural ?? current?.auto_apply_structural === 1) ? 1 : 0,
      (input.dryRunUntilReviewed ?? current?.dry_run_until_reviewed !== 0) ? 1 : 0,
      probeInvalidated ? null : current?.last_probe_at ?? null,
      probeInvalidated ? null : current?.last_probe_ok ?? null,
      probeInvalidated ? null : current?.last_probe_error ?? null,
      timestamp,
    )
    .run()

  // Toggling the preview gate is the explicit acknowledgement that allows one
  // new scheduled preview, or resumes live maintenance when it is disabled.
  const reviewGateChanged = input.dryRunUntilReviewed !== undefined
    && input.dryRunUntilReviewed !== (current?.dry_run_until_reviewed !== 0)
  if (reviewGateChanged) {
    await env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, awaiting_review)
       VALUES (?, 1, 0)
       ON CONFLICT(owner_id) DO UPDATE SET awaiting_review = 0`,
    )
      .bind(ownerId)
      .run()
  }

  return getCatalogSettings(env, ownerId)
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
    'UPDATE agent_settings SET last_probe_at = ?, last_probe_ok = ?, last_probe_error = ?, updated_at = ? WHERE owner_id = ?',
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

/**
 * Resolves the stored configuration into a usable provider, decrypting the
 * credential at the point of use. Callers inside a Workflow must call this in
 * the same step that performs the request: a decrypted key must never travel in
 * a step result.
 */
export async function providerForOwner(env: Env, ownerId: string): Promise<Provider> {
  const row = await loadSettingsRow(env, ownerId)
  if (!row || row.provider === 'none' || row.model === null || row.model.length === 0)
    return { kind: 'none' }
  if (row.provider === 'workers-ai')
    return { kind: 'workers-ai', model: row.model }
  if (row.api_key_ciphertext === null || row.api_key_iv === null)
    return { kind: 'none' }
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
