import type { Env } from '../env'
import type { LlmToolCall, ModelMessage } from '../llm'
import type { CatalogSnapshot } from './model'
import type { ActionRecord, ToolContext } from './tools'
import { AppError } from '../errors'
import { assertActionableReply, describeProvider, respondWithTools } from '../llm'
import { loadSnapshot } from './model'
import { buildBatchMessage, buildSystemPrompt, rebuildMessages } from './prompt'
import { providerForOwner } from './settings'
import { executeTool, toolsFor } from './tools'

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

interface ToolResultRow {
  toolCallId: string
  name: string
  content: string
}

function now(): string {
  return new Date().toISOString()
}

async function loadTurns(env: Env, runId: string, batch: number): Promise<TurnRow[]> {
  const rows = await env.DB.prepare(
    `SELECT turn, content, tool_calls_json, tool_results_json, action_summary_json, finish_reason
     FROM catalog_turns WHERE run_id = ? AND batch = ? ORDER BY turn`,
  )
    .bind(runId, batch)
    .all<TurnRow>()
  return rows.results
}

async function loadTurn(env: Env, runId: string, batch: number, turn: number): Promise<TurnRow | null> {
  return env.DB.prepare(
    'SELECT turn, content, tool_calls_json, tool_results_json, action_summary_json, finish_reason FROM catalog_turns WHERE run_id = ? AND batch = ? AND turn = ?',
  )
    .bind(runId, batch, turn)
    .first<TurnRow>()
}

/** The agent's workspace for one turn, assembled inside the step that needs it. */
async function loadTurnContext(input: TurnInput): Promise<CatalogSnapshot> {
  return loadSnapshot(input.env, input.ownerId, input.memoryIds, input.includeContent)
}

export async function thinkTurn(input: TurnInput): Promise<ThinkResult> {
  const existing = await loadTurn(input.env, input.runId, input.batch, input.turn)
  if (existing !== null && existing.tool_calls_json !== null) {
    const recordedCalls = JSON.parse(existing.tool_calls_json) as LlmToolCall[]
    // This turn already ran: a step retry must not pay for it twice.
    assertRecordedTurnActionable(existing.finish_reason, recordedCalls)
    return {
      turn: input.turn,
      content: existing.content,
      toolCallCount: recordedCalls.length,
      noToolCalls: recordedCalls.length === 0,
      promptTokens: null,
      completionTokens: null,
      provider: 'recorded',
      model: null,
    }
  }

  const provider = await providerForOwner(input.env, input.ownerId)
  if (provider.kind === 'none') {
    throw new AppError(
      'AGENT_NOT_CONFIGURED',
      'No model endpoint is configured for this account.',
    )
  }
  const snapshot = await loadTurnContext(input)
  const runRow = await input.env.DB.prepare(
    'SELECT operator_prompt FROM catalog_runs WHERE id = ? AND owner_id = ?',
  )
    .bind(input.runId, input.ownerId)
    .first<{ operator_prompt: string | null }>()
  const systemPrompt = buildSystemPrompt(
    snapshot.categories,
    input.includeContent,
    runRow?.operator_prompt,
  )
  const batchMessage = buildBatchMessage(snapshot.memories)
  const messages: ModelMessage[] = rebuildMessages(
    systemPrompt,
    batchMessage,
    await loadTurns(input.env, input.runId, input.batch),
  )

  const started = Date.now()
  const reply = await respondWithTools(
    input.env,
    provider,
    messages,
    toolsFor({ includeSearch: false }),
    { maxOutputTokens: 4096 },
  )
  const described = describeProvider(provider)

  await input.env.DB.prepare(
    `INSERT INTO catalog_turns(run_id, owner_id, batch, turn, content, tool_calls_json, prompt_tokens, completion_tokens, latency_ms, finish_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, batch, turn) DO NOTHING`,
  )
    .bind(
      input.runId,
      input.ownerId,
      input.batch,
      input.turn,
      reply.content,
      JSON.stringify(reply.toolCalls),
      reply.usage.promptTokens ?? null,
      reply.usage.completionTokens ?? null,
      Date.now() - started,
      provider.kind === 'responses-api'
        ? reply.finishReason
        : reply.toolCalls.length > 0 ? 'tool_calls' : 'stop',
      now(),
    )
    .run()

  // Persist the provider's terminal state and any paid usage before rejecting
  // an unusable response. A Workflow replay reads this row and raises the same
  // error without calling the provider again.
  if (provider.kind === 'responses-api')
    assertActionableReply(reply)

  return {
    turn: input.turn,
    content: reply.content,
    toolCallCount: reply.toolCalls.length,
    noToolCalls: reply.toolCalls.length === 0,
    promptTokens: reply.usage.promptTokens ?? null,
    completionTokens: reply.usage.completionTokens ?? null,
    provider: described.provider,
    model: described.model,
  }
}

function assertRecordedTurnActionable(
  finishReason: string | null,
  calls: LlmToolCall[],
): void {
  if (finishReason?.startsWith('incomplete:') === true) {
    throw new AppError(
      'PROVIDER_OUTPUT_INCOMPLETE',
      `The model response was incomplete (${finishReason.slice('incomplete:'.length)}).`,
      false,
    )
  }
  if (finishReason?.startsWith('failed:') === true) {
    throw new AppError(
      'PROVIDER_ERROR',
      `The model reported a failed response (${finishReason.slice('failed:'.length)}).`,
      false,
    )
  }
  if (finishReason === 'completed' && calls.length === 0) {
    throw new AppError(
      'PROVIDER_TOOL_UNSUPPORTED',
      'The model completed the request without calling a required tool.',
      false,
    )
  }
}

interface RecordedAction {
  result_json: string | null
  decision: string
}

async function loadAction(
  env: Env,
  runId: string,
  batch: number,
  turn: number,
  callIndex: number,
): Promise<RecordedAction | null> {
  return env.DB.prepare(
    'SELECT result_json, decision FROM catalog_actions WHERE run_id = ? AND batch = ? AND turn = ? AND call_index = ?',
  )
    .bind(runId, batch, turn, callIndex)
    .first<RecordedAction>()
}

async function recordAction(
  env: Env,
  input: TurnInput,
  callIndex: number,
  tool: string,
  argumentsJson: string,
  result: Record<string, unknown>,
  action: ActionRecord | undefined,
): Promise<void> {
  if (action === undefined)
    return
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, target_category_id, target_project, arguments_json, result_json, before_json, after_json, rationale, decision, policy_reason, created_at)
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

export async function actTurn(input: TurnInput, reassignmentsSoFar: number): Promise<ActResult> {
  const row = await loadTurn(input.env, input.runId, input.batch, input.turn)
  if (row === null) {
    throw new AppError(
      'INTERNAL_ERROR',
      'The conversation turn was not recorded before its tools ran.',
    )
  }
  if (row.tool_results_json !== null) {
    // Already executed; report the recorded outcome instead of repeating it.
    const recorded = row.action_summary_json === null
      ? null
      : (JSON.parse(row.action_summary_json) as Omit<ActResult, 'turn'>)
    return recorded === null
      ? { turn: input.turn, finished: false, applied: 0, rejected: 0, reassignments: 0, stalled: true }
      : { turn: input.turn, ...recorded }
  }
  const calls = row.tool_calls_json === null
    ? []
    : (JSON.parse(row.tool_calls_json) as LlmToolCall[])
  if (calls.length === 0)
    return { turn: input.turn, finished: false, applied: 0, rejected: 0, reassignments: 0, stalled: true }

  const snapshot = await loadTurnContext(input)
  const results: ToolResultRow[] = []
  let applied = 0
  let rejected = 0
  let finished = false
  let reassignments = 0

  const executable = calls.slice(0, input.maxToolCalls)
  const overflow = calls.slice(input.maxToolCalls)
  for (const [callIndex, call] of executable.entries()) {
    const recorded = await loadAction(input.env, input.runId, input.batch, input.turn, callIndex)
    if (recorded !== null) {
      const parsed = recorded.result_json === null
        ? {}
        : (JSON.parse(recorded.result_json) as Record<string, unknown>)
      results.push({
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify({ ...parsed, replayed: true }),
      })
      continue
    }
    const context: ToolContext = {
      env: input.env,
      ownerId: input.ownerId,
      runId: input.runId,
      batch: input.batch,
      turn: input.turn,
      callIndex,
      mode: input.mode,
      includeContent: input.includeContent,
      snapshot,
      batchMemoryIds: new Set(input.memoryIds),
      reassignments: reassignmentsSoFar + reassignments,
    }
    const outcome = await executeTool(context, call.name, call.arguments)
    const decision = outcome.action?.decision
    if (decision === 'rejected_by_policy')
      rejected += 1
    else if (decision === 'applied' || decision === 'skipped')
      applied += 1
    if (outcome.reassigned === true)
      reassignments += 1
    if (outcome.finished === true)
      finished = true
    await recordAction(
      input.env,
      input,
      callIndex,
      call.name,
      JSON.stringify(call.arguments ?? {}),
      outcome.result,
      outcome.action,
    )
    results.push({ toolCallId: call.id, name: call.name, content: JSON.stringify(outcome.result) })
  }

  // Responses providers require exactly one function_call_output for every
  // function call id before another assistant message. The previous implementation
  // silently sliced the array, producing an invalid transcript on the next
  // turn. Overflow calls are refused, journalled and answered without running
  // their requested effect.
  for (const [offset, call] of overflow.entries()) {
    const callIndex = input.maxToolCalls + offset
    const reason = `This turn exceeded its budget of ${input.maxToolCalls} tool calls. The extra call was not executed.`
    const result = { ok: false, rejected: true, budgetExceeded: true, reason }
    await recordAction(
      input.env,
      input,
      callIndex,
      call.name,
      JSON.stringify(call.arguments ?? {}),
      result,
      {
        kind: call.name,
        effect: 'control',
        decision: 'rejected_by_policy',
        policyReason: reason,
      },
    )
    rejected += 1
    results.push({ toolCallId: call.id, name: call.name, content: JSON.stringify(result) })
  }

  const summary: Omit<ActResult, 'turn'> = {
    finished,
    applied,
    rejected,
    reassignments,
    stalled: overflow.length > 0,
  }
  await input.env.DB.prepare(
    'UPDATE catalog_turns SET tool_results_json = ?, action_summary_json = ? WHERE run_id = ? AND batch = ? AND turn = ?',
  )
    .bind(JSON.stringify(results), JSON.stringify(summary), input.runId, input.batch, input.turn)
    .run()

  return { turn: input.turn, ...summary }
}
