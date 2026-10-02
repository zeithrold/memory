import type { Env } from '../env'
import { AppError } from '../errors'
import {
  IMPLICIT_SKIP_REASON,
  selectBatch,
} from './model'
import { REASSIGNMENT_AGE_DAYS } from './policy'
import { isoNow } from './run-common'
import { loadSettingsRow } from './settings'

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
  options: { runId: string, dryRun: boolean, maxMemories?: number },
): Promise<BatchStart> {
  const { runId, dryRun, maxMemories } = options

  const settings = await loadSettingsRow(env, ownerId)
  if (settings === null) {
    throw new AppError('AGENT_NOT_CONFIGURED', 'This account has no catalog settings.')
  }
  const cutoff = new Date(Date.now() - REASSIGNMENT_AGE_DAYS * 86_400_000).toISOString()
  const memoryIds = await selectBatch(
    env,
    ownerId,
    {
      limit: Math.min(settings.max_batch, maxMemories ?? settings.max_batch),
      reviewCutoff: cutoff,
    },
  )
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

interface RecordImplicitSkipsContext {
  mode: 'live' | 'dry_run'
  memoryIds: string[]
  statements: D1PreparedStatement[]
  env: Env
  ownerId: string
}
function recordImplicitSkips(
  context: RecordImplicitSkipsContext,
): void {
  const { mode, memoryIds, statements, env, ownerId } = context
  if (mode === 'live') {
    const timestamp = isoNow()
    const retryAfterSixHours = new Date(Date.now() + 6 * 3_600_000).toISOString()
    const retryAfterOneDay = new Date(Date.now() + 24 * 3_600_000).toISOString()
    for (const memoryId of memoryIds) {
      statements.push(
        env.DB.prepare(

          `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at,
source, retry_after)
           SELECT ?, ?, ?, m.version, 1, ?, 'implicit', ?
           FROM memories m
           WHERE m.id = ? AND m.owner_id = ? AND m.deleted = 0
             AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id)
           ON CONFLICT(memory_id) DO UPDATE SET
             reason = excluded.reason,
             memory_version = excluded.memory_version,
             attempts = CASE
               WHEN catalog_skips.memory_version = excluded.memory_version THEN catalog_skips.attempts
+ 1
               ELSE 1
             END,
             created_at = excluded.created_at,
             source = 'implicit',
             retry_after = CASE
               WHEN catalog_skips.memory_version != excluded.memory_version THEN excluded.retry_after
               WHEN catalog_skips.attempts = 1 THEN ?
               ELSE NULL
             END
           WHERE catalog_skips.memory_version != excluded.memory_version
              OR COALESCE(
                   catalog_skips.source,
                   CASE WHEN catalog_skips.reason = ? THEN 'implicit' ELSE 'explicit' END
                 ) = 'implicit'`,
        )

          .bind(

            ownerId,

            memoryId,

            IMPLICIT_SKIP_REASON,

            timestamp,

            retryAfterSixHours,

            memoryId,

            ownerId,

            retryAfterOneDay,

            IMPLICIT_SKIP_REASON,

          ),
      )
    }
  }
}
interface FinalizeBatchOptions { runId: string, memoryIds: string[], stats: BatchStats, mode?: 'live' | 'dry_run' }

export async function finalizeBatch(
  env: Env,
  ownerId: string,
  options: FinalizeBatchOptions,
): Promise<{ unorganized: number }> {
  const { runId, memoryIds, stats, mode = 'live' } = options

  const unorganized = memoryIds.length === 0
    ? 0
    : await countUnorganized(env, ownerId, memoryIds)
  const statements = [
    env.DB.prepare(
      `UPDATE catalog_runs SET batches = batches + 1, turns = turns + ?, tool_calls = tool_calls
+ ?, rejected = rejected + ?, actions_applied = actions_applied + ?, memories_seen = memories_seen
+ ?, unorganized = unorganized + ? WHERE id = ?`,
    )
      .bind(
        stats.turns,
        stats.toolCalls,
        stats.rejected,
        stats.applied,
        memoryIds.length,
        unorganized,
        runId,
      ),
  ]
  recordImplicitSkips({ mode, memoryIds, statements, env, ownerId })
  statements.push(
    env.DB.prepare(
      `INSERT INTO catalog_state(owner_id, version, last_run_at, next_run_at, category_count,
assigned_count, orphan_count, skipped_count)
       VALUES (?, 1, ?, NULL,
               (SELECT count(*) FROM categories WHERE owner_id = ? AND state != 'retired'),
               (SELECT count(*) FROM memory_categories WHERE owner_id = ?),
               (SELECT count(*) FROM memories m WHERE m.owner_id = ? AND m.deleted = 0
                  AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id
= m.id)),
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

async function countUnorganized(
  env: Env,
  ownerId: string,
  memoryIds: string[],
): Promise<number> {
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
