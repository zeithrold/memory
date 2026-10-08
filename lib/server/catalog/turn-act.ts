import type { ToolContext } from './tools'
import type { ActResult, ToolResultRow, TurnInput } from './turn-store'
import { z } from 'zod'
import { AppError } from '../errors'
import { executeTool } from './tools'
import { loadAction, loadTurn, loadTurnContext, recordAction } from './turn-store'

type ExecuteTurnCallsContext = {
  executable: { [x: string]: unknown, id: string, name: string, arguments: z.core.util.JSONType }[]
  input: TurnInput
  results: ToolResultRow[]
  reassignmentsSoFar: number
  counters: Pick<ActResult, 'applied' | 'rejected' | 'finished' | 'reassignments'>
  snapshot: ToolContext['snapshot']
}

type ExecuteTurnCallContext = ExecuteTurnCallsContext & {
  callIndex: number
  call: ExecuteTurnCallsContext['executable'][number]
}
async function executeTurnCall(
  request: ExecuteTurnCallContext,
): Promise<void> {
  const { callIndex, call, input, results, reassignmentsSoFar, counters, snapshot } = request

  const recorded = await loadAction(
    input.env,
    input.runId,
    { batch: input.batch, turn: input.turn, callIndex },
  )
  if (recorded !== null) {
    const parsed = recorded.result_json === null
      ? {}
      : (z.record(z.string(), z.unknown()).parse(JSON.parse(recorded.result_json)))
    results.push({
      toolCallId: call.id,
      name: call.name,
      content: JSON.stringify({ ...parsed, replayed: true }),
    })
    return
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
    reassignments: reassignmentsSoFar + counters.reassignments,
  }
  const outcome = await executeTool(context, call.name, call.arguments)
  updateTurnCounters(counters, outcome)
  await recordAction(
    input.env,
    input,
    {
      callIndex,
      tool: call.name,
      argumentsJson: JSON.stringify(call.arguments ?? {}),
      result: outcome.result,
      action: outcome.action,
    },
  )
  results.push({ toolCallId: call.id, name: call.name, content: JSON.stringify(outcome.result) })
}
async function executeTurnCalls(context: ExecuteTurnCallsContext): Promise<void> {
  const { executable } = context
  for (const [callIndex, call] of executable.entries()) {
    await executeTurnCall({ ...context, callIndex, call })
  }
}

type RejectOverflowCallsContext = {
  overflow: { [x: string]: unknown, id: string, name: string, arguments: z.core.util.JSONType }[]
  input: TurnInput
  counters: Pick<ActResult, 'applied' | 'rejected' | 'finished' | 'reassignments'>
  results: ToolResultRow[]
}
async function rejectOverflowCalls(
  context: RejectOverflowCallsContext,
): Promise<void> {
  const { overflow, input, counters, results } = context
  for (const [offset, call] of overflow.entries()) {
    const callIndex = input.maxToolCalls + offset
    const reason = `This turn exceeded its budget of ${input.maxToolCalls} tool calls. The extra call was not executed.`
    const result = { ok: false, rejected: true, budgetExceeded: true, reason }
    await recordAction(
      input.env,
      input,
      { callIndex, tool: call.name, argumentsJson: JSON.stringify(call.arguments ?? {}), result, action: {
        kind: call.name,
        effect: 'control',
        decision: 'rejected_by_policy',
        policyReason: reason,
      } },
    )
    counters.rejected += 1
    results.push({ toolCallId: call.id, name: call.name, content: JSON.stringify(result) })
  }
}
export async function actTurn(
  input: TurnInput,
  reassignmentsSoFar: number,
): Promise<ActResult> {
  const row = await loadTurn(input.env, input.runId, input.batch, input.turn)
  if (row === null) {
    throw new AppError(
      'INTERNAL_ERROR',
      'The conversation turn was not recorded before its tools ran.',
    )
  }
  if (row.tool_results_json !== null) {
    // Already executed; report the recorded outcome instead of repeating it.
    return recordedTurnSummary(row.action_summary_json, input.turn)
  }
  const calls = row.tool_calls_json === null
    ? []
    : (z.array(z.looseObject({ id: z.string(), name: z.string(), arguments: z.json() })).parse(
        JSON.parse(row.tool_calls_json),
      ))
  if (calls.length === 0) {
    return idleTurn(input)
  }

  const snapshot = await loadTurnContext(input)
  const results: ToolResultRow[] = []
  const counters: Pick<ActResult, 'applied' | 'rejected' | 'finished' | 'reassignments'> = {
    applied: 0,
    rejected: 0,
    finished: false,
    reassignments: 0,
  }

  const executable = calls.slice(0, input.maxToolCalls)
  const overflow = calls.slice(input.maxToolCalls)
  await executeTurnCalls({ executable, input, results, reassignmentsSoFar, counters, snapshot })

  // Responses providers require exactly one function_call_output for every
  // function call id before another assistant message. The previous implementation
  // silently sliced the array, producing an invalid transcript on the next
  // turn. Overflow calls are refused, journalled and answered without running
  // their requested effect.
  await rejectOverflowCalls({ overflow, input, counters, results })

  const summary: Omit<ActResult, 'turn'> = {
    ...counters,
    stalled: overflow.length > 0,
  }
  await input.env.DB.prepare(
    ('UPDATE catalog_turns SET tool_results_json = ?, action_summary_json = ? '
      + 'WHERE run_id = ? AND batch = ? AND turn = ?'),
  )
    .bind(
      JSON.stringify(results),
      JSON.stringify(summary),
      input.runId,
      input.batch,
      input.turn,
    )
    .run()

  return { turn: input.turn, ...summary }
}

function idleTurn(input: TurnInput): ActResult {
  return {
    turn: input.turn,
    finished: false,
    applied: 0,
    rejected: 0,
    reassignments: 0,
    stalled: true,
  }
}

function updateTurnCounters(
  counters: ExecuteTurnCallsContext['counters'],
  outcome: Awaited<ReturnType<typeof executeTool>>,
): void {
  const decision = outcome.action?.decision
  if (decision === 'rejected_by_policy') {
    counters.rejected += 1
  }
  else
    if (decision === 'applied' || decision === 'skipped') {
      counters.applied += 1
    }
  if (outcome.reassigned === true) {
    counters.reassignments += 1
  }
  if (outcome.finished === true) {
    counters.finished = true
  }
}

function recordedTurnSummary(summaryJson: string | null, turn: number): ActResult {
  const recorded = summaryJson === null
    ? null
    : (z.looseObject({
        finished: z.boolean(),
        applied: z.number(),
        rejected: z.number(),
        reassignments: z.number(),
        stalled: z.boolean(),
      }).parse(JSON.parse(summaryJson)))
  return recorded === null
    ? {
        turn,
        finished: false,
        applied: 0,
        rejected: 0,
        reassignments: 0,
        stalled: true,
      }
    : { turn, ...recorded }
}
