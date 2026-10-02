import type { Env } from '../env'
import type { RunRow, RunSummary } from './query-run-types'

export const RUN_COLUMNS = `id, trigger, mode, status, provider, model, batches, turns, tool_calls, rejected,
  memories_seen, actions_applied, unorganized, prompt_tokens, completion_tokens, usage_missing_turns,
  error_code, started_at, finished_at`

export function serializeRun(row: RunRow): RunSummary {
  return {
    id: row.id,
    trigger: row.trigger,
    mode: row.mode,
    status: row.status,
    provider: row.provider,
    model: row.model,
    batches: row.batches,
    turns: row.turns,
    toolCalls: row.tool_calls,
    rejected: row.rejected,
    memoriesSeen: row.memories_seen,
    actionsApplied: row.actions_applied,
    unorganized: row.unorganized,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.prompt_tokens === null && row.completion_tokens === null
      ? null
      : (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0),
    usageMissingTurns: row.usage_missing_turns,
    tokenUsageComplete: row.usage_missing_turns === 0,
    errorCode: row.error_code,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export async function listRuns(
  env: Env,
  ownerId: string,
  limit: number,
  offset = 0,
): Promise<{ runs: RunSummary[], total: number, offset: number, limit: number }> {
  const [rows, totalRow] = await Promise.all(
    [
      env.DB.prepare(
        `SELECT ${RUN_COLUMNS} FROM catalog_runs WHERE owner_id = ? ORDER BY started_at DESC LIMIT
? OFFSET ?`,
      )
        .bind(

          ownerId,

          limit,

          offset,
        )
        .all<RunRow>(),
      env.DB.prepare(
        'SELECT count(*) AS n FROM catalog_runs WHERE owner_id = ?',
      )
        .bind(ownerId)
        .first<{ n: number }>(),
    ],
  )
  return {
    runs: rows.results.map(serializeRun),
    total: totalRow?.n ?? 0,
    offset,
    limit,
  }
}
