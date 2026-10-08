import type { BatchStart, BatchStats } from './run'
import type { ActResult, TurnInput } from './turn-store'
import type { WorkflowContext } from './workflow-owner'
import { NonRetryableError } from 'cloudflare:workflows'
import { AppError } from '../errors'
import { automaticTurnAllowed } from './run'
import { actTurn, thinkTurn } from './turn'

type TurnOutcome = {
  stats: BatchStats
  exhausted: boolean
  budgetStopped: boolean
}

export async function runTurns(
  context: WorkflowContext,
  opened: BatchStart,
  batch: number,
): Promise<TurnOutcome> {
  const stats: BatchStats = { turns: 0, toolCalls: 0, rejected: 0, applied: 0 }
  let reassignments = 0
  let rejectedStreak = 0
  const { env, ownerId, runId, step } = context
  const { prefix } = context.options
  for (let turn = 0; turn < opened.maxTurns; turn++) {
    const input: TurnInput = {
      env,
      ownerId,
      runId,
      batch,
      turn,
      mode: opened.mode,
      includeContent: opened.includeContent,
      maxToolCalls: opened.maxToolCalls,
      memoryIds: opened.memoryIds,
    }
    const thought = await workflowThink(context, input)
    if (thought.budgetExceeded) {
      return { stats, budgetStopped: true, exhausted: true }
    }
    stats.turns += 1
    stats.toolCalls += thought.toolCallCount
    if (thought.noToolCalls) {
      return { stats, budgetStopped: false, exhausted: false }
    }
    const acted = await step.do(`${prefix}-${batch}-${turn}-act`, async () => await actTurn(input, reassignments))
    reassignments += acted.reassignments
    stats.applied += acted.applied
    stats.rejected += acted.rejected
    if (acted.finished || acted.stalled) {
      return { stats, budgetStopped: false, exhausted: false }
    }
    rejectedStreak = nextRejectionStreak(rejectedStreak, acted)
    if (rejectedStreak >= 2) {
      return { stats, budgetStopped: false, exhausted: true }
    }
  }
  return { stats, budgetStopped: false, exhausted: true }
}

function nextRejectionStreak(previous: number, acted: ActResult): number {
  return acted.applied === 0 && acted.rejected > 0 ? previous + 1 : 0
}

async function workflowThink(
  context: WorkflowContext,
  input: TurnInput,
) {
  const { step, env, ownerId, options } = context
  const { prefix, trigger } = options
  return await step.do(
    `${prefix}-${input.batch}-${input.turn}-think`,
    {
      retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
      timeout: '5 minutes',
    },
    async () => {
      if (trigger === 'schedule' && !(await automaticTurnAllowed(env, ownerId))) {
        return {
          turn: input.turn,
          content: null,
          toolCallCount: 0,
          noToolCalls: true,
          promptTokens: null,
          completionTokens: null,
          provider: 'budget',
          model: null,
          budgetExceeded: true,
        }
      }
      try {
        return { ...(await thinkTurn(input)), budgetExceeded: false }
      }
      catch (error) {
        if (error instanceof AppError && error.retryable === false) {
          throw new NonRetryableError(`${error.code}:${error.message}`)
        }
        throw error
      }
    },
  )
}
