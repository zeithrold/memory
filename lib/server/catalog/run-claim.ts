import type { Env } from '../env'
import type { CatalogSettingsRow } from './settings'
import { AppError } from '../errors'

import { isoNow, minutesAgo, STALE_RUN_MINUTES } from './run-common'
import { dailyCatalogUsage } from './run-schedule'
import { loadSettingsRow } from './settings'

/**
 * Claims a run row for one account. A run already in flight is reused rather
 * than duplicated, which is what serializes an account's runs: two agents must
 * not reorganize the same catalog at the same time.
 *
 * Operator notes (a manual prompt plus any pending rejection advice) are
 * written onto the run row and cleared from catalog_state here, so Workflow
 * step state never carries the user's text.
 */

type LoadOperatorPromptContext = {
  env: Env
  ownerId: string
  manualPrompt: string | undefined
}
async function loadOperatorPrompt(
  context: LoadOperatorPromptContext,
): Promise<{ operatorPrompt: string | null }> {
  const { env, ownerId, manualPrompt } = context
  const state = await env.DB.prepare(
    'SELECT pending_advice FROM catalog_state WHERE owner_id = ?',
  )
    .bind(ownerId)
    .first<{ pending_advice: string | null }>()
  const parts: string[] = []
  if (manualPrompt !== undefined && manualPrompt.trim().length > 0) {
    parts.push(manualPrompt.trim())
  }
  if (state?.pending_advice !== null && state?.pending_advice !== undefined
    && state.pending_advice.trim().length > 0) {
    parts.push(state.pending_advice.trim())
  }
  const operatorPrompt = parts.length > 0 ? parts.join('\n\n') : null
  return { operatorPrompt }
}

type RecordClaimedRunContext = {
  env: Env
  ownerId: string
  manualPrompt: string | undefined
  dryRun: boolean
  trigger: 'schedule' | 'manual'
  settings: CatalogSettingsRow
}
async function recordClaimedRun(context: RecordClaimedRunContext): Promise<{ runId: string }> {
  const { env, ownerId, manualPrompt, dryRun, trigger, settings } = context
  const { operatorPrompt } = await loadOperatorPrompt({ env, ownerId, manualPrompt })

  // The dry-run default is what makes a first run safe: the account sees what
  // the agent would do before anything changes.
  const mode = dryRun ? 'dry_run' : 'live'
  const runId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, provider, model, started_at,
operator_prompt)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  )
    .bind(
      runId,
      ownerId,
      trigger,
      mode,
      settings.provider,
      settings.model,
      isoNow(),
      operatorPrompt,
    )
    .run()
  if (operatorPrompt !== null) {
    await env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, pending_advice)
       VALUES (?, 1, NULL)
       ON CONFLICT(owner_id) DO UPDATE SET pending_advice = NULL`,
    )
      .bind(ownerId)
      .run()
  }
  if (trigger === 'schedule' && dryRun) {
    await env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, awaiting_review)
       VALUES (?, 1, 1)
       ON CONFLICT(owner_id) DO UPDATE SET awaiting_review = 1`,
    )
      .bind(ownerId)
      .run()
  }
  return { runId }
}
type ClaimRunOptions = { trigger: 'schedule' | 'manual', dryRun: boolean, manualPrompt?: string }

export async function claimRun(
  env: Env,
  ownerId: string,
  options: ClaimRunOptions,
): Promise<{ runId: string, reused: boolean, dryRun: boolean, budgetWarning: boolean }> {
  const { trigger, dryRun, manualPrompt } = options

  const settings = await loadSettingsRow(env, ownerId)
  if (settings === null || settings.enabled !== 1 || settings.provider === 'none') {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'Scheduled catalog maintenance is not enabled for this account.',
    )
  }
  const inFlight = await env.DB.prepare(
    `SELECT id, mode FROM catalog_runs
     WHERE owner_id = ? AND status IN ('queued', 'running') AND started_at > ?
     ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(ownerId, minutesAgo(STALE_RUN_MINUTES))
    .first<{ id: string, mode: string }>()
  if (inFlight !== null) {
    if (trigger === 'manual') {
      throw new AppError(
        'RUN_IN_PROGRESS',
        'A catalog run for this account is already in progress.',
      )
    }
    return {
      runId: inFlight.id,
      reused: true,
      dryRun: inFlight.mode === 'dry_run',
      budgetWarning: false,
    }
  }

  const stale = await env.DB.prepare(
    `UPDATE catalog_runs SET status = 'failed', error_code = 'STALE_RUN', finished_at = ?
     WHERE owner_id = ? AND status IN ('queued', 'running') AND started_at <= ?`,
  )
    .bind(isoNow(), ownerId, minutesAgo(STALE_RUN_MINUTES))
    .run()
  void stale

  const { runId } = await recordClaimedRun({ env, ownerId, manualPrompt, dryRun, trigger, settings })
  const usage = await dailyCatalogUsage(env, ownerId)
  return {
    runId,
    reused: false,
    dryRun,
    budgetWarning: usage.tokens >= settings.daily_token_budget,
  }
}
