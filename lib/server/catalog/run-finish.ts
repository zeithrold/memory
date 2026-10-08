import type { Env } from '../env'

import { CATALOG_CADENCE_MINUTES, isoNow } from './run-common'
import { loadSettingsRow } from './settings'

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped' | 'reverted'

type FinishRunOptions = { runId: string, status: RunStatus, errorCode?: string, scheduledAt?: number }

export async function finishRun(
  env: Env,
  ownerId: string,
  options: FinishRunOptions,
): Promise<void> {
  const { runId, status, errorCode, scheduledAt } = options

  const settings = await loadSettingsRow(env, ownerId)
  const interval = settings?.interval_minutes ?? 30
  const state = await env.DB.prepare(
    'SELECT next_run_at, failure_streak FROM catalog_state WHERE owner_id = ?',
  )
    .bind(ownerId)
    .first<{ next_run_at: string | null, failure_streak: number }>()
  await aggregateRunAudit(env, runId)
  // Scheduled runs stay anchored to their dispatch window, so model latency
  // cannot turn a 30-minute interval into almost an hour. A manual run never
  // postpones an existing schedule; NULL means the next cadence window is due.
  const { next, failureStreak } = nextSchedule(state, interval, status, scheduledAt)
  const run = await env.DB.prepare('SELECT unorganized FROM catalog_runs WHERE id = ?')
    .bind(runId)
    .first<{ unorganized: number }>()
  const finalStatus: RunStatus = status === 'succeeded' && (run?.unorganized ?? 0) > 0
    ? 'partial'
    : status
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE catalog_runs SET status = ?, error_code = ?, finished_at = ?,
       budget_exhausted = CASE WHEN ? = 'DAILY_TOKEN_BUDGET' THEN 1 ELSE budget_exhausted
END
       WHERE id = ?`,
    ).bind(finalStatus, errorCode ?? null, isoNow(), errorCode ?? null, runId),
    env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, last_run_at, next_run_at, failure_streak)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET last_run_at = excluded.last_run_at,
         next_run_at = excluded.next_run_at, failure_streak = excluded.failure_streak`,
    ).bind(ownerId, isoNow(), next, failureStreak),
  ])
  await rollupMetrics(env, ownerId, runId)
}

function alignToCatalogWindow(timestamp: number): string {
  const windowMs = CATALOG_CADENCE_MINUTES * 60_000
  return new Date(Math.ceil(timestamp / windowMs) * windowMs).toISOString()
}

async function aggregateRunAudit(
  env: Env,
  runId: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE catalog_runs SET
       turns = (SELECT count(*) FROM catalog_turns t WHERE t.run_id = catalog_runs.id),
       tool_calls = COALESCE((SELECT sum(json_array_length(t.tool_calls_json)) FROM catalog_turns
t WHERE t.run_id = catalog_runs.id), 0),
       rejected = (SELECT count(*) FROM catalog_actions a WHERE a.run_id = catalog_runs.id
AND a.decision = 'rejected_by_policy'),
       actions_applied = (SELECT count(*) FROM catalog_actions a WHERE a.run_id = catalog_runs.id
AND a.decision IN ('applied', 'skipped')),
       prompt_tokens = CASE WHEN EXISTS (SELECT 1 FROM catalog_turns t WHERE t.run_id =
catalog_runs.id)
         THEN COALESCE((SELECT sum(t.prompt_tokens) FROM catalog_turns t WHERE t.run_id
= catalog_runs.id), 0)
         ELSE prompt_tokens END,
       completion_tokens = CASE WHEN EXISTS (SELECT 1 FROM catalog_turns t WHERE t.run_id
= catalog_runs.id)
         THEN COALESCE((SELECT sum(t.completion_tokens) FROM catalog_turns t WHERE t.run_id
= catalog_runs.id), 0)
         ELSE completion_tokens END,
       usage_missing_turns = (SELECT count(*) FROM catalog_turns t WHERE t.run_id = catalog_runs.id
         AND (t.prompt_tokens IS NULL OR t.completion_tokens IS NULL))
     WHERE id = ?`,
  )
    .bind(
      runId,
    )
    .run()
}

/**
 * Folds a finished run into the daily rollup. Raw turns and actions are pruned
 * after 90 days, so the trends the project measures have to survive them.
 */
async function rollupMetrics(
  env: Env,
  ownerId: string,
  runId: string,
): Promise<void> {
  const run = await env.DB.prepare(
    'SELECT substr(started_at, 1, 10) AS day FROM catalog_runs WHERE id = ?',
  )
    .bind(runId)
    .first<{ day: string }>()
  const day = run?.day ?? isoNow().slice(0, 10)
  const state = await env.DB.prepare(
    'SELECT category_count, orphan_count FROM catalog_state WHERE owner_id = ?',
  )
    .bind(ownerId)
    .first<{ category_count: number, orphan_count: number }>()
  await env.DB.prepare(
    `INSERT INTO catalog_metrics_daily(owner_id, day, runs, dry_runs, turns, tool_calls, applied,
rejected, unorganized, reassignments, category_count, orphan_count, prompt_tokens, completion_tokens,
usage_missing_turns)
     SELECT ?, ?, count(*),
       COALESCE(sum(CASE WHEN mode = 'dry_run' THEN 1 ELSE 0 END), 0),
       COALESCE(sum(turns), 0), COALESCE(sum(tool_calls), 0), COALESCE(sum(actions_applied),
0),
       COALESCE(sum(rejected), 0), COALESCE(sum(unorganized), 0),
       (SELECT count(*) FROM catalog_actions a JOIN catalog_runs rr ON rr.id = a.run_id
        WHERE rr.owner_id = ? AND substr(rr.started_at, 1, 10) = ?
          AND rr.status NOT IN ('queued', 'running') AND a.kind = 'assign' AND a.decision
= 'applied'),
       ?, ?, COALESCE(sum(prompt_tokens), 0), COALESCE(sum(completion_tokens), 0),
       COALESCE(sum(usage_missing_turns), 0)
     FROM catalog_runs WHERE owner_id = ? AND substr(started_at, 1, 10) = ?
       AND status NOT IN ('queued', 'running')
     ON CONFLICT(owner_id, day) DO UPDATE SET
       runs = excluded.runs,
       dry_runs = excluded.dry_runs,
       turns = excluded.turns,
       tool_calls = excluded.tool_calls,
       applied = excluded.applied,
       rejected = excluded.rejected,
       unorganized = excluded.unorganized,
       reassignments = excluded.reassignments,
       category_count = excluded.category_count,
       orphan_count = excluded.orphan_count,
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens,
       usage_missing_turns = excluded.usage_missing_turns`,
  )
    .bind(
      ownerId,
      day,
      ownerId,
      day,
      state?.category_count ?? 0,
      state?.orphan_count ?? 0,
      ownerId,
      day,
    )
    .run()
}

function nextSchedule(
  state: { next_run_at: string | null, failure_streak: number } | null,
  interval: number,
  status: RunStatus,
  scheduledAt?: number,
): { next: string | null, failureStreak: number } {
  let next = state?.next_run_at ?? null
  let failureStreak = state?.failure_streak ?? 0
  if (status === 'failed') {
    failureStreak += 1
    if (scheduledAt !== undefined) {
      const backoffMinutes = [
        120,
        360,
        1440,
      ][Math.min(failureStreak - 1, 2)] ?? 1440
      next = alignToCatalogWindow(scheduledAt + Math.max(interval, backoffMinutes) * 60_000)
    }
  }
  else {
    failureStreak = 0
    if (scheduledAt !== undefined) {
      next = new Date(scheduledAt + interval * 60_000).toISOString()
    }
  }
  return { next, failureStreak }
}
