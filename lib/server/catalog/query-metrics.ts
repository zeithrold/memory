import type { Env } from '../env'

/** Re-classifications this run applied, for the churn metric. */
export async function getMetrics(env: Env, ownerId: string): Promise<unknown> {
  const [daily, totals] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM catalog_metrics_daily WHERE owner_id = ? ORDER BY day DESC LIMIT 90',
    )
      .bind(ownerId)
      .all(),
    env.DB.prepare(
      `SELECT count(*) AS runs, COALESCE(sum(turns), 0) AS turns, COALESCE(sum(tool_calls), 0)
AS tool_calls,
              COALESCE(sum(applied), 0) AS applied, COALESCE(sum(rejected), 0) AS rejected,
              COALESCE(sum(reassignments), 0) AS reassignments, COALESCE(sum(unorganized),
0) AS unorganized,
              COALESCE(sum(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(sum(completion_tokens), 0) AS completion_tokens,
              COALESCE(sum(usage_missing_turns), 0) AS usage_missing_turns
       FROM catalog_metrics_daily WHERE owner_id = ?`,
    )
      .bind(ownerId)
      .first(),
  ])
  return { totals, daily: daily.results }
}
