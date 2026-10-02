import type { Env } from '../env'
import type { CatalogSnapshot } from './model'
import type { ActionRecord } from './tools'
import { loadSnapshot } from './model'

/**
 * The two halves of one conversation turn, as the Workflow runs them.
 *
 * `think` calls the model; `act` executes what it asked for. Splitting them
 * means a retry never repeats a paid call, and each half is separately
 * checkpointed by the Workflows engine.
 *
 * Both halves are idempotent through the audit tables rather than through
 * in-memory state:
 * - `think` returns the recorded message when this turn already ran;
 * - `act` returns the recorded result for a call index that already executed.
 *
 * That is also why a decrypted credential never leaves the step: it is read and
 * used inside `think`, and only the model's reply is returned.
 */
export interface TurnInput {
  env: Env
  ownerId: string
  runId: string
  batch: number
  turn: number
  mode: 'live' | 'dry_run'
  includeContent: boolean
  /**
   * Budgets are read once per batch by the caller and passed in, so the loop
   * bound stays deterministic across a replay.
   */
  maxToolCalls: number
  /** Batch memory ids, returned by the batch step. Ids only, never text. */
  memoryIds: string[]
}

export interface ThinkResult {
  turn: number
  /** The model's free-form reasoning, shown in the run timeline. */
  content: string | null
  /**
   * How many tools it asked for. The calls themselves are read back from the
   * audit tables by `actTurn`, so a step result stays a flat record of
   * primitives: the Workflows serializer recurses through returned types, and a
   * nested JSON structure is not worth that.
   */
  toolCallCount: number
  /** The model answered without calling a tool, which ends the batch. */
  noToolCalls: boolean
  promptTokens: number | null
  completionTokens: number | null
  provider: string
  model: string | null
}

export interface ActResult {
  turn: number
  finished: boolean
  applied: number
  rejected: number
  /** Re-classifications applied in this turn, to be added to the batch total. */
  reassignments: number
  /** Set when the model called no tools at all in this turn. */
  stalled: boolean
}

interface TurnRow {
  turn: number
  content: string | null
  tool_calls_json: string | null
  tool_results_json: string | null
  action_summary_json: string | null
  finish_reason: string | null
}

export interface ToolResultRow {
  toolCallId: string
  name: string
  content: string
}

export function now(): string {
  return new Date().toISOString()
}

export async function loadTurns(
  env: Env,
  runId: string,
  batch: number,
): Promise<TurnRow[]> {
  const rows = await env.DB.prepare(
    `SELECT turn, content, tool_calls_json, tool_results_json, action_summary_json, finish_reason
     FROM catalog_turns WHERE run_id = ? AND batch = ? ORDER BY turn`,
  )
    .bind(
      runId,
      batch,
    )
    .all<TurnRow>()
  return rows.results
}

export async function loadTurn(
  env: Env,
  runId: string,
  batch: number,
  turn: number,
): Promise<TurnRow | null> {
  return await env.DB.prepare(
    ('SELECT turn, content, tool_calls_json, tool_results_json, '
      + 'action_summary_json, finish_reason FROM catalog_turns WHERE run_id = ? AND '
      + 'batch = ? AND turn = ?'),
  )
    .bind(runId, batch, turn)
    .first<TurnRow>()
}

/** The agent's workspace for one turn, assembled inside the step that needs it. */
export async function loadTurnContext(input: TurnInput): Promise<CatalogSnapshot> {
  return await loadSnapshot(input.env, input.ownerId, input.memoryIds, input.includeContent)
}

interface RecordedAction {
  result_json: string | null
  decision: string
}

export async function loadAction(
  env: Env,
  runId: string,
  options: { batch: number, turn: number, callIndex: number },
): Promise<RecordedAction | null> {
  const { batch, turn, callIndex } = options

  return await env.DB.prepare(
    'SELECT result_json, decision FROM catalog_actions WHERE run_id = ? AND batch = ? AND turn = ? AND call_index = ?',
  )
    .bind(
      runId,
      batch,
      turn,
      callIndex,
    )
    .first<RecordedAction>()
}

interface RecordActionOptions {
  callIndex: number
  tool: string
  argumentsJson: string
  result: Record<string, unknown>
  action: ActionRecord | undefined
}

export async function recordAction(
  env: Env,
  input: TurnInput,
  options: RecordActionOptions,
): Promise<void> {
  const { callIndex, tool, argumentsJson, result, action } = options

  if (action === undefined) {
    return
  }
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, target_category_id, target_project, arguments_json, result_json,
before_json, after_json, rationale, decision, policy_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, batch, turn, call_index) DO NOTHING`,
  )
    .bind(
      input.runId,
      input.ownerId,
      input.batch,
      input.turn,
      callIndex,
      tool,
      action.kind,
      action.effect,
      action.memoryId ?? null,
      action.categoryId ?? null,
      action.targetCategoryId ?? null,
      action.targetProject ?? null,
      argumentsJson,
      JSON.stringify(result).slice(0, 4000),
      action.before === undefined ? null : JSON.stringify(action.before).slice(0, 4000),
      action.after === undefined ? null : JSON.stringify(action.after).slice(0, 4000),
      action.rationale ?? null,
      action.decision,
      action.policyReason ?? null,
      now(),
    )
    .run()
}
