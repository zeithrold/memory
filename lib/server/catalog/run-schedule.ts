import type { Env } from '../env'
import type { DailyCatalogUsage, DueOwner } from './run-common'
import {
  selectBatch,
} from './model'
import { MIN_EVIDENCE_RUNS, REASSIGNMENT_AGE_DAYS } from './policy'
import { CATALOG_CADENCE_MINUTES, isoNow, MAX_OWNERS_PER_FIRING } from './run-common'
import { loadSettingsRow } from './settings'

/**
 * Starts one catalog instance per cadence window.
 *
 * Declaring `schedules` on the Workflow binding would be the obvious mechanism,
 * but **a scheduled Workflow requires a paid Workers plan**: the deployment
 * rejects the trigger configuration outright. So the existing minute Cron
 * Trigger dispatches instead. It is already deployed and already covered by a
 * Sentry Crons monitor, and Workflows themselves are available on the Free plan
 * — only the automatic schedule is not.
 *
 * The instance id is derived from the window rather than generated, so a
 * retried cron event collapses onto the instance it already created instead of
 * starting a second run over the same accounts.
 */
export async function dispatchCatalogWorkflow(
  env: Env,
  scheduledTime: number,
): Promise<{ dispatched: boolean, instanceId: string | null }> {
  if (!(env.CATALOG_WORKFLOW !== undefined)) {
    return { dispatched: false, instanceId: null }
  }
  // Cron reports the scheduled time, which for a minutely trigger is the minute
  // boundary; rounding tolerates the few milliseconds of skew a scheduler
  // occasionally introduces.
  const minute = Math.round(scheduledTime / 60_000)
  if (minute % CATALOG_CADENCE_MINUTES !== 0) {
    return { dispatched: false, instanceId: null }
  }
  const instanceId = `catalog-${minute}`
  const windowTime = minute * 60_000
  const owners = await dueOwners(env, MAX_OWNERS_PER_FIRING)
  if (owners.length === 0) {
    return { dispatched: false, instanceId: null }
  }
  try {
    await env.CATALOG_WORKFLOW.create({ id: instanceId, params: { scheduledAt: windowTime, owners } })
  }
  catch (error) {
    // Instance ids are unique, so a collision means this window already has an
    // instance, which is the outcome the caller wanted.
    if (error instanceof Error && error.message.includes('already exists')) {
      return { dispatched: false, instanceId }
    }
    throw error
  }
  return { dispatched: true, instanceId }
}

/**
 * Accounts with work to do, oldest first. Accounts without a model provider are
 * never selected, so the Free plan's step budget is not spent on runs that
 * would immediately do nothing.
 */
export async function dailyCatalogUsage(
  env: Env,
  ownerId: string,
): Promise<DailyCatalogUsage> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(sum(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS
tokens,
            count(*) AS turns,
            sum(CASE WHEN prompt_tokens IS NULL OR completion_tokens IS NULL THEN 1 ELSE
0 END) AS missing
     FROM catalog_turns WHERE owner_id = ? AND substr(created_at, 1, 10) = ?`,
  )
    .bind(ownerId, isoNow().slice(0, 10))
    .first<{ tokens: number, turns: number, missing: number }>()
  return { tokens: row?.tokens ?? 0, turns: row?.turns ?? 0, missingTurns: row?.missing ?? 0 }
}

/**
 * Automatic runs stop before the next paid model call when the daily guard is
 * reached. Manual runs deliberately bypass this check, but still contribute to
 * the usage total shown in settings.
 */
export async function automaticTurnAllowed(env: Env, ownerId: string): Promise<boolean> {
  const [settings, usage] = await Promise.all([
    loadSettingsRow(env, ownerId),
    dailyCatalogUsage(env, ownerId),
  ])
  if (settings === null || usage.tokens >= settings.daily_token_budget) {
    return false
  }
  return usage.missingTurns === 0 || usage.turns < 4
}

export async function dueOwners(
  env: Env,
  limit: number,
): Promise<DueOwner[]> {
  const rows = await env.DB.prepare(
    `SELECT s.owner_id, s.dry_run_until_reviewed, s.max_batch, s.daily_token_budget,
            s.auto_apply_structural, COALESCE(c.awaiting_review, 0) AS awaiting_review
     FROM agent_settings s
     LEFT JOIN catalog_state c ON c.owner_id = s.owner_id
     WHERE s.enabled = 1 AND s.provider != 'none'
       AND (c.next_run_at IS NULL OR c.next_run_at <= ?)
     ORDER BY COALESCE(c.next_run_at, '') , s.owner_id
     LIMIT 100`,
  )
    .bind(isoNow())
    .all<{
    owner_id: string
    dry_run_until_reviewed: number
    max_batch: number
    daily_token_budget: number
    auto_apply_structural: number
    awaiting_review: number
  }>()
  const due: DueOwner[] = []
  const cutoff = new Date(Date.now() - REASSIGNMENT_AGE_DAYS * 86_400_000).toISOString()
  for (const row of rows.results) {
    const dryRun = row.dry_run_until_reviewed === 1
    if (dryRun && row.awaiting_review === 1) {
      continue
    }
    const usage = await dailyCatalogUsage(env, row.owner_id)
    if (usage.tokens >= row.daily_token_budget) {
      continue
    }
    if (usage.missingTurns > 0 && usage.turns >= 4) {
      continue
    }
    const candidate = await selectBatch(env, row.owner_id, { limit: 1, reviewCutoff: cutoff })
    const actionableProposal = await hasActionableProposal(env, row.owner_id, row.auto_apply_structural)
    if (candidate.length === 0 && !actionableProposal) {
      continue
    }
    due.push({ ownerId: row.owner_id, dryRun })
    if (due.length >= limit) {
      break
    }
  }
  return due
}

async function hasActionableProposal(
  env: Env,
  ownerId: string,
  autoApply: number,
): Promise<boolean> {
  return autoApply === 1 && (await env.DB.prepare(
    `SELECT count(*) AS n FROM catalog_proposals
       WHERE owner_id = ? AND status = 'pending' AND evidence_runs >= ?`,
  )
    .bind(ownerId, MIN_EVIDENCE_RUNS)
    .first<number>('n') ?? 0) > 0
}
