import type { Env } from '../env'
import type { ActionRow, RunDetail, RunRow, TimelineEntry, TurnMeta } from './query-run-types'
import { AppError } from '../errors'
import { RUN_COLUMNS, serializeRun } from './query-run-list'

const ACTION_PAGE_SIZE = 40

/**
 * A page of the run replay, ordered by turn, with memory titles resolved at
 * read time. The audit tables deliberately store identifiers rather than a
 * copy of the memory, so forgetting a memory also removes it from old run
 * timelines.
 */

interface LoadRunForReplayContext {
  env: Env
  runId: string
  ownerId: string
}

async function loadRunForReplay(
  context: LoadRunForReplayContext,
): Promise<{ run: RunRow & { operator_prompt: string | null } }> {
  const { env, runId, ownerId } = context
  const run = await env.DB.prepare(
    `SELECT ${RUN_COLUMNS}, operator_prompt FROM catalog_runs WHERE id = ? AND owner_id = ?`,
  )
    .bind(runId, ownerId)
    .first<RunRow & { operator_prompt: string | null }>()
  if (run === null) {
    throw new AppError('RUN_NOT_FOUND', 'No catalog run exists with that identifier.')
  }
  return { run }
}

export async function getRunDetail(
  env: Env,
  ownerId: string,
  options: { runId: string, offset?: number, limit?: number },
): Promise<RunDetail> {
  const { runId, offset = 0, limit = ACTION_PAGE_SIZE } = options

  const { run } = await loadRunForReplay({ env, runId, ownerId })

  const [totalRow, actionPage] = await Promise.all(
    [
      env.DB.prepare(
        'SELECT count(*) AS n FROM catalog_actions WHERE run_id = ? AND owner_id = ?',
      )
        .bind(runId, ownerId)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT a.id, a.batch, a.turn, a.tool, a.kind, a.effect, a.decision, a.policy_reason, a.rationale,
              a.memory_id, m.title AS memory_title, a.category_id, c.label AS category_label,
              a.target_category_id, tc.label AS target_category_label, a.target_project
       FROM catalog_actions a
       LEFT JOIN memories m ON m.id = a.memory_id
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN categories tc ON tc.id = a.target_category_id
       WHERE a.run_id = ? AND a.owner_id = ?
       ORDER BY a.batch, a.turn, a.call_index
       LIMIT ? OFFSET ?`,
      )
        .bind(

          runId,

          ownerId,

          limit,

          offset,
        )
        .all<ActionRow>(),
    ],
  )

  const turnKeys = new Set(actionPage.results.map(action => `${action.batch}:${action.turn}`))
  const turnRows: { results: TurnMeta[] } = turnKeys.size === 0
    ? { results: [] }
    : await env.DB.prepare(
        `SELECT batch, turn, content, prompt_tokens, completion_tokens, latency_ms
         FROM catalog_turns WHERE run_id = ? AND owner_id = ?
         ORDER BY batch, turn`,
      )
        .bind(runId, ownerId)
        .all<TurnMeta>()

  return {
    run: serializeRun(run),
    timeline: buildTimeline(turnRows.results, actionPage.results, turnKeys),
    totalActions: totalRow?.n ?? 0,
    offset,
    limit,
    operatorPrompt: run.operator_prompt,
  }
}

function buildTimeline(
  turnRows: TurnMeta[],
  actions: ActionRow[],
  turnKeys: Set<string>,
): TimelineEntry[] {
  const timeline = new Map<string, TimelineEntry>()
  for (const turn of turnRows) {
    const key = `${turn.batch}:${turn.turn}`
    if (!turnKeys.has(key)) {
      continue
    }
    timeline.set(key, {
      batch: turn.batch,
      turn: turn.turn,
      content: turn.content,
      promptTokens: turn.prompt_tokens,
      completionTokens: turn.completion_tokens,
      latencyMs: turn.latency_ms,
      actions: [],
    })
  }
  for (const action of actions) {
    const key = `${action.batch}:${action.turn}`
    let entry = timeline.get(key)
    if (entry === undefined) {
      entry = {
        batch: action.batch,
        turn: action.turn,
        content: null,
        promptTokens: null,
        completionTokens: null,
        latencyMs: null,
        actions: [],
      }
      timeline.set(key, entry)
    }
    entry.actions.push(serializeAction(action))
  }
  return Array.from(timeline.values()).sort((left, right) => {
    const batchOrder = left.batch - right.batch
    return batchOrder === 0 ? left.turn - right.turn : batchOrder
  })
}

function serializeAction(action: ActionRow): TimelineEntry['actions'][number] {
  return {
    id: action.id,
    tool: action.tool,
    kind: action.kind,
    effect: action.effect,
    decision: action.decision,
    policyReason: action.policy_reason,
    rationale: action.rationale,
    memoryId: action.memory_id,
    memoryTitle: action.memory_title,
    categoryId: action.category_id,
    categoryLabel: action.category_label,
    targetCategoryId: action.target_category_id,
    targetCategoryLabel: action.target_category_label,
    targetProject: action.target_project,
  }
}
