import { z } from 'zod'

/**
 * Per-account model configuration.
 *
 * The credential is write-only from the API's point of view: it goes in, and
 * only a hint comes back. Nothing here returns `api_key_ciphertext` to a
 * client, and the plaintext is never placed in a Workflow step result, because
 * step results are persisted as instance state.
 */
export const providerKinds = [
  'none',
  'responses-api',
  'workers-ai',
] as const

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
    intervalMinutes: z.number().int().min(30).max(1440).refine(
      value => value % 30 === 0,
      'Run interval must be a multiple of 30 minutes.',
    ).optional(),
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

export const DEFAULT_INTERVAL_MINUTES = 30

/**
 * Conservative Free-plan defaults: every conversation turn costs two Workflow
 * steps against a 3,000-step daily allowance, and each step has a 10 ms CPU
 * budget, so batches stay small until a user raises them.
 */
export const DEFAULT_MAX_BATCH = 6

export const DEFAULT_MAX_TURNS = 2

export const DEFAULT_MAX_TOOL_CALLS = 8

export const DEFAULT_DAILY_TOKEN_BUDGET = 100000

export interface CatalogRuntimeStatus {
  awaitingReview: boolean
  failureStreak: number
  todayTokens: number
  tokenUsageComplete: boolean
}
