import type { Env } from '../env'
import type { ActionRecord } from './tools'
import { AppError } from '../errors'
import { loadCategories, selectBatch } from './model'
import { MIN_EVIDENCE_RUNS, MIN_MEMBERS_TO_KEEP, proposalNeedsApproval, REASSIGNMENT_AGE_DAYS } from './policy'
import { loadSettingsRow } from './settings'

/**
 * Run orchestration, kept as plain functions so the Workflow is a thin shell
 * over testable service code.
 *
 * Every function here is written to be safe to call twice: the Workflows engine
 * retries a step whenever it is not certain the step finished, so "did this
 * already happen" is answered from D1 rather than from memory.
 */
/**
 * Step budget arithmetic for the Workers Free plan, which allows 3,000
 * Workflow steps per day.
 *
 * One owner costs at most 1 (claim) + batches x (1 + 2 per turn + 1) + 2
 * (consolidate, finish). With two owners, two batches and three turns that is
 * 38 steps per firing, and a firing every 30 minutes gives 48 x 38 = 1,824
 * steps per day, leaving a third of the allowance for manual runs.
 *
 * Raising either cap without redoing this arithmetic spends a day's budget
 * before the day is over; the queue is ordered by `next_run_at`, so accounts
 * take turns instead of being served simultaneously.
 */
export const MAX_OWNERS_PER_FIRING = 2
export const MAX_BATCHES_PER_RUN = 2
export const MAX_STEPS_PER_FIRING = 40
/**
 * How often a catalog run is dispatched. A Cron Trigger fires this Worker every
 * minute, and only the windows on this boundary start an instance.
 */
export const CATALOG_CADENCE_MINUTES = 30
/** A run left in `running` beyond this is treated as abandoned. */
export const STALE_RUN_MINUTES = 15

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
  if (!env.CATALOG_WORKFLOW)
    return { dispatched: false, instanceId: null }
  // Cron reports the scheduled time, which for a minutely trigger is the minute
  // boundary; rounding tolerates the few milliseconds of skew a scheduler
  // occasionally introduces.
  const minute = Math.round(scheduledTime / 60_000)
  if (minute % CATALOG_CADENCE_MINUTES !== 0)
    return { dispatched: false, instanceId: null }
  const instanceId = `catalog-${minute}`
  try {
    await env.CATALOG_WORKFLOW.create({ id: instanceId, params: {} })
  }
  catch (error) {
    // Instance ids are unique, so a collision means this window already has an
    // instance, which is the outcome the caller wanted.
    if (error instanceof Error && error.message.includes('already exists'))
      return { dispatched: false, instanceId }
    throw error
  }
  return { dispatched: true, instanceId }
}
export const MANUAL_DEDUPE_SECONDS = 60

export interface DueOwner {
  ownerId: string
  dryRun: boolean
}

function isoNow(): string {
  return new Date().toISOString()
}
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/**
 * Accounts with work to do, oldest first. Accounts without a model provider are
 * never selected, so the Free plan's step budget is not spent on runs that
 * would immediately do nothing.
 */
export async function dueOwners(env: Env, limit: number): Promise<DueOwner[]> {
  const rows = await env.DB.prepare(
    `SELECT s.owner_id, s.dry_run_until_reviewed
     FROM agent_settings s
     LEFT JOIN catalog_state c ON c.owner_id = s.owner_id
     WHERE s.enabled = 1 AND s.provider != 'none'
       AND (c.next_run_at IS NULL OR c.next_run_at <= ?)
     ORDER BY COALESCE(c.next_run_at, '') , s.owner_id
     LIMIT ?`,
  )
    .bind(isoNow(), limit)
    .all<{ owner_id: string, dry_run_until_reviewed: number }>()
  return rows.results.map(row => ({
    ownerId: row.owner_id,
    dryRun: row.dry_run_until_reviewed === 1,
  }))
}

/**
 * Claims a run row for one account. A run already in flight is reused rather
 * than duplicated, which is what serializes an account's runs: two agents must
 * not reorganize the same catalog at the same time.
 */
export async function claimRun(
  env: Env,
  ownerId: string,
  trigger: 'schedule' | 'manual',
  dryRun: boolean,
): Promise<{ runId: string, reused: boolean, dryRun: boolean }> {
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
    return { runId: inFlight.id, reused: true, dryRun: inFlight.mode === 'dry_run' }
  }

  const stale = await env.DB.prepare(
    `UPDATE catalog_runs SET status = 'failed', error_code = 'STALE_RUN', finished_at = ?
     WHERE owner_id = ? AND status IN ('queued', 'running') AND started_at <= ?`,
  )
    .bind(isoNow(), ownerId, minutesAgo(STALE_RUN_MINUTES))
    .run()
  void stale

  // The dry-run default is what makes a first run safe: the account sees what
  // the agent would do before anything changes.
  const mode = dryRun ? 'dry_run' : 'live'
  const runId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, provider, model, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
  )
    .bind(runId, ownerId, trigger, mode, settings.provider, settings.model, isoNow())
    .run()
  return { runId, reused: false, dryRun }
}

export interface BatchStart {
  memoryIds: string[]
  maxTurns: number
  maxToolCalls: number
  includeContent: boolean
  mode: 'live' | 'dry_run'
}

/**
 * Opens one batch. Budgets are read here, once per batch, and then travel as
 * plain arguments: the loop bound has to be identical on every replay, so it
 * cannot be re-read from a table that may have changed mid-run.
 */
export async function startBatch(
  env: Env,
  ownerId: string,
  runId: string,
  dryRun: boolean,
): Promise<BatchStart> {
  const settings = await loadSettingsRow(env, ownerId)
  if (settings === null)
    throw new AppError('AGENT_NOT_CONFIGURED', 'This account has no catalog settings.')
  const cutoff = new Date(Date.now() - REASSIGNMENT_AGE_DAYS * 86_400_000).toISOString()
  const memoryIds = await selectBatch(env, ownerId, settings.max_batch, cutoff)
  const mode = dryRun ? 'dry_run' : 'live'
  await env.DB.prepare('UPDATE catalog_runs SET mode = ? WHERE id = ? AND status = ?')
    .bind(mode, runId, 'running')
    .run()
  return {
    memoryIds,
    maxTurns: settings.max_turns,
    maxToolCalls: settings.max_tool_calls,
    includeContent: settings.include_content === 1,
    mode,
  }
}

export interface BatchStats {
  turns: number
  toolCalls: number
  rejected: number
  applied: number
}

/**
 * Closes a batch: records that unclassified memories were looked at, refreshes
 * the catalog counters, and folds the batch's numbers into the run.
 *
 * A memory the agent neither classified nor skipped gets an implicit skip so it
 * cannot lead every future batch; the attempt counter stops that after a few
 * runs, and an edit clears it.
 */
export async function finalizeBatch(
  env: Env,
  ownerId: string,
  runId: string,
  memoryIds: string[],
  stats: BatchStats,
): Promise<{ unorganized: number }> {
  const unorganized = memoryIds.length === 0
    ? 0
    : await countUnorganized(env, ownerId, memoryIds)
  const statements = [
    env.DB.prepare(
      `UPDATE catalog_runs SET batches = batches + 1, turns = turns + ?, tool_calls = tool_calls + ?, rejected = rejected + ?, actions_applied = actions_applied + ?, memories_seen = memories_seen + ?, unorganized = unorganized + ? WHERE id = ?`,
    ).bind(
      stats.turns,
      stats.toolCalls,
      stats.rejected,
      stats.applied,
      memoryIds.length,
      unorganized,
      runId,
    ),
  ]
  for (const memoryId of memoryIds) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at)
         SELECT ?, ?, 'Left unclassified by the agent.', m.version, 1, ?
         FROM memories m
         WHERE m.id = ? AND m.owner_id = ? AND m.deleted = 0
           AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id)
           AND NOT EXISTS (SELECT 1 FROM catalog_skips s WHERE s.memory_id = m.id)
         ON CONFLICT(memory_id) DO UPDATE SET attempts = attempts + 1`,
      ).bind(ownerId, memoryId, isoNow(), memoryId, ownerId),
    )
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, last_run_at, next_run_at, category_count, assigned_count, orphan_count, skipped_count)
       VALUES (?, 1, ?, NULL,
               (SELECT count(*) FROM categories WHERE owner_id = ? AND state != 'retired'),
               (SELECT count(*) FROM memory_categories WHERE owner_id = ?),
               (SELECT count(*) FROM memories m WHERE m.owner_id = ? AND m.deleted = 0
                  AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id)),
               (SELECT count(*) FROM catalog_skips WHERE owner_id = ?))
       ON CONFLICT(owner_id) DO UPDATE SET
         last_run_at = excluded.last_run_at,
         category_count = excluded.category_count,
         assigned_count = excluded.assigned_count,
         orphan_count = excluded.orphan_count,
         skipped_count = excluded.skipped_count`,
    ).bind(ownerId, isoNow(), ownerId, ownerId, ownerId, ownerId),
  )
  await env.DB.batch(statements)
  return { unorganized }
}

async function countUnorganized(env: Env, ownerId: string, memoryIds: string[]): Promise<number> {
  const placeholders = memoryIds.map(() => '?').join(', ')
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM memories m
     WHERE m.owner_id = ? AND m.id IN (${placeholders})
       AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id)`,
  )
    .bind(ownerId, ...memoryIds)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export interface ConsolidateResult {
  applied: number
  queued: number
  superseded: number
  pruned: number
}

/**
 * The arbitration pass.
 *
 * Structural edits reach the catalog only here, and only with evidence from
 * more than one run. Applying them per turn is the measured failure mode:
 * removing this stage took a taxonomy from 25 to 70 nodes while every coherence
 * metric got worse (arXiv:2603.19711). When an account has not opted into
 * automatic application, a proposal that has enough evidence is left pending
 * for a human to approve.
 */
export async function consolidate(
  env: Env,
  ownerId: string,
  runId: string,
): Promise<ConsolidateResult> {
  const settings = await loadSettingsRow(env, ownerId)
  const autoApply = settings?.auto_apply_structural === 1
  const needsApproval = proposalNeedsApproval(autoApply)
  const proposals = await env.DB.prepare(
    `SELECT id, kind, category_id, target_category_id, memory_id, target_project, payload_json, rationale, evidence_runs
     FROM catalog_proposals WHERE owner_id = ? AND status = 'pending' ORDER BY created_at`,
  )
    .bind(ownerId)
    .all<{
    id: string
    kind: string
    category_id: string | null
    target_category_id: string | null
    memory_id: string | null
    target_project: string | null
    payload_json: string
    rationale: string | null
    evidence_runs: number
  }>()

  const categories = await loadCategories(env, ownerId)
  let applied = 0
  let queued = 0
  let superseded = 0
  let pruned = 0

  for (const proposal of proposals.results) {
    if (proposal.kind === 'create_category') {
      const payload = JSON.parse(proposal.payload_json) as {
        parentId: string | null
        slug: string
        label: string
        description: string
        boundary: string
        axisHint: string | null
      }
      const exists = categories.some(
        category => category.parent_id === payload.parentId && category.slug === payload.slug,
      )
      if (exists) {
        await env.DB.prepare(
          'UPDATE catalog_proposals SET status = \'superseded\', resolved_at = ? WHERE id = ?',
        )
          .bind(isoNow(), proposal.id)
          .run()
        superseded += 1
        continue
      }
      if (proposal.evidence_runs < MIN_EVIDENCE_RUNS) {
        queued += 1
        continue
      }
      if (needsApproval) {
        queued += 1
        continue
      }
      const id = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, axis_hint, depth, member_count, state, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', 'agent', ?, ?)`,
      )
        .bind(
          id,
          ownerId,
          payload.parentId,
          payload.slug,
          payload.label,
          payload.description,
          payload.boundary,
          payload.axisHint,
          payload.parentId === null ? 1 : 2,
          isoNow(),
          isoNow(),
        )
        .run()
      await env.DB.prepare(
        'UPDATE catalog_proposals SET status = \'approved\', resolved_at = ? WHERE id = ?',
      )
        .bind(isoNow(), proposal.id)
        .run()
      await recordStructuralAction(env, ownerId, runId, 'create_category', 'applied', {
        categoryId: id,
        rationale: proposal.rationale ?? undefined,
        after: payload,
      })
      applied += 1
      continue
    }
    // Merge, retire and project-move proposals always wait for a human: each can
    // change what a project-restricted token can see, or remove a category.
    queued += 1
  }

  // A category that never attracted members is proposed for a merge into its
  // parent rather than deleted, so nothing is lost.
  for (const category of categories) {
    if (category.member_count > MIN_MEMBERS_TO_KEEP || category.parent_id === null)
      continue
    const existing = await env.DB.prepare(
      'SELECT id FROM catalog_proposals WHERE owner_id = ? AND kind = \'merge_category\' AND category_id = ? AND status = \'pending\'',
    )
      .bind(ownerId, category.id)
      .first<{ id: string }>()
    if (existing !== null)
      continue
    await env.DB.prepare(
      `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id, target_category_id, payload_json, rationale, evidence_runs, status, created_at)
       VALUES (?, ?, ?, ?, 'merge_category', ?, ?, ?, ?, 1, 'pending', ?)`,
    )
      .bind(
        crypto.randomUUID(),
        ownerId,
        runId,
        runId,
        category.id,
        category.parent_id,
        JSON.stringify({ fromId: category.id, intoId: category.parent_id }),
        `"${category.label}" holds ${category.member_count} memories, below the threshold of ${MIN_MEMBERS_TO_KEEP}.`,
        isoNow(),
      )
      .run()
    await recordStructuralAction(env, ownerId, runId, 'merge_category', 'proposed', {
      categoryId: category.id,
      targetCategoryId: category.parent_id,
      rationale: `Only ${category.member_count} memories; propose folding into the parent.`,
    })
    pruned += 1
  }

  return { applied, queued, superseded, pruned }
}

async function recordStructuralAction(
  env: Env,
  ownerId: string,
  runId: string,
  kind: string,
  decision: 'applied' | 'proposed',
  detail: Partial<ActionRecord>,
): Promise<void> {
  const seq = await env.DB.prepare(
    'SELECT COALESCE(max(call_index), 0) + 1 AS next FROM catalog_actions WHERE run_id = ? AND batch = -1',
  )
    .bind(runId)
    .first<{ next: number }>()
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, target_category_id, target_project, arguments_json, rationale, decision, created_at)
     VALUES (?, ?, -1, 0, ?, ?, ?, 'proposal', ?, ?, ?, ?, '{}', ?, ?, ?)
     ON CONFLICT(run_id, batch, turn, call_index) DO NOTHING`,
  )
    .bind(
      runId,
      ownerId,
      seq?.next ?? 1,
      kind,
      kind,
      detail.memoryId ?? null,
      detail.categoryId ?? null,
      detail.targetCategoryId ?? null,
      detail.targetProject ?? null,
      detail.rationale ?? null,
      decision,
      isoNow(),
    )
    .run()
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped' | 'reverted'

export async function finishRun(
  env: Env,
  ownerId: string,
  runId: string,
  status: RunStatus,
  errorCode?: string,
): Promise<void> {
  const settings = await loadSettingsRow(env, ownerId)
  const interval = settings?.interval_minutes ?? 30
  const next = new Date(Date.now() + interval * 60_000).toISOString()
  const run = await env.DB.prepare('SELECT unorganized FROM catalog_runs WHERE id = ?')
    .bind(runId)
    .first<{ unorganized: number }>()
  const finalStatus: RunStatus = status === 'succeeded' && (run?.unorganized ?? 0) > 0
    ? 'partial'
    : status
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE catalog_runs SET status = ?, error_code = ?, finished_at = ? WHERE id = ?',
    ).bind(finalStatus, errorCode ?? null, isoNow(), runId),
    env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, last_run_at, next_run_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET last_run_at = excluded.last_run_at, next_run_at = excluded.next_run_at`,
    ).bind(ownerId, isoNow(), next),
  ])
  await rollupMetrics(env, ownerId, runId)
}

/**
 * Folds a finished run into the daily rollup. Raw turns and actions are pruned
 * after 90 days, so the trends the project measures have to survive them.
 */
async function rollupMetrics(env: Env, ownerId: string, runId: string): Promise<void> {
  const day = isoNow().slice(0, 10)
  const run = await env.DB.prepare(
    'SELECT turns, tool_calls, actions_applied, rejected, unorganized, prompt_tokens, completion_tokens, mode FROM catalog_runs WHERE id = ?',
  )
    .bind(runId)
    .first<{
    turns: number
    tool_calls: number
    actions_applied: number
    rejected: number
    unorganized: number
    prompt_tokens: number | null
    completion_tokens: number | null
    mode: string
  }>()
  const reassignments = await env.DB.prepare(
    'SELECT count(*) AS n FROM catalog_actions WHERE run_id = ? AND kind = \'assign\' AND decision = \'applied\'',
  )
    .bind(runId)
    .first<{ n: number }>()
  const state = await env.DB.prepare(
    'SELECT category_count, orphan_count FROM catalog_state WHERE owner_id = ?',
  )
    .bind(ownerId)
    .first<{ category_count: number, orphan_count: number }>()
  await env.DB.prepare(
    `INSERT INTO catalog_metrics_daily(owner_id, day, runs, dry_runs, turns, tool_calls, applied, rejected, unorganized, reassignments, category_count, orphan_count, prompt_tokens, completion_tokens)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, day) DO UPDATE SET
       runs = runs + 1,
       dry_runs = dry_runs + excluded.dry_runs,
       turns = turns + excluded.turns,
       tool_calls = tool_calls + excluded.tool_calls,
       applied = applied + excluded.applied,
       rejected = rejected + excluded.rejected,
       unorganized = unorganized + excluded.unorganized,
       reassignments = reassignments + excluded.reassignments,
       category_count = excluded.category_count,
       orphan_count = excluded.orphan_count,
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       completion_tokens = completion_tokens + excluded.completion_tokens`,
  )
    .bind(
      ownerId,
      day,
      run?.mode === 'dry_run' ? 1 : 0,
      run?.turns ?? 0,
      run?.tool_calls ?? 0,
      run?.actions_applied ?? 0,
      run?.rejected ?? 0,
      run?.unorganized ?? 0,
      reassignments?.n ?? 0,
      state?.category_count ?? 0,
      state?.orphan_count ?? 0,
      run?.prompt_tokens ?? 0,
      run?.completion_tokens ?? 0,
    )
    .run()
}
