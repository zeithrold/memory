import type { BatchStats } from './run'
import type { WorkflowContext } from './workflow-owner'
import { finalizeBatch, MAX_BATCHES_PER_RUN, SCHEDULED_DRY_RUN_MAX_BATCH, startBatch } from './run'
import { runTurns } from './workflow-turns'

type BatchOutcome = {
  stats: BatchStats
  exhausted: boolean
  budgetStopped: boolean
  empty: boolean
}

export async function runBatches(context: WorkflowContext): Promise<{
  totals: BatchStats
  exhausted: boolean
  budgetStopped: boolean
}> {
  const { trigger, dryRun } = context.options
  const totals: BatchStats = { turns: 0, toolCalls: 0, rejected: 0, applied: 0 }
  let exhausted = false
  let budgetStopped = false
  const maxBatches = trigger === 'schedule' && dryRun ? 1 : MAX_BATCHES_PER_RUN
  for (let batch = 0; batch < maxBatches; batch++) {
    const outcome = await runBatch(context, batch)
    if (outcome.empty) {
      break
    }
    totals.turns += outcome.stats.turns
    totals.toolCalls += outcome.stats.toolCalls
    totals.rejected += outcome.stats.rejected
    totals.applied += outcome.stats.applied
    exhausted ||= outcome.exhausted
    budgetStopped ||= outcome.budgetStopped
    if (budgetStopped) {
      break
    }
  }
  return { totals, exhausted, budgetStopped }
}

async function runBatch(
  context: WorkflowContext,
  batch: number,
): Promise<BatchOutcome> {
  const { env, step, ownerId, runId, options } = context
  const { prefix, dryRun, trigger } = options
  const opened = await step.do(`${prefix}-${batch}-open`, async () => await startBatch(env, ownerId, {
    runId,
    dryRun,
    maxMemories: trigger === 'schedule' && dryRun ? SCHEDULED_DRY_RUN_MAX_BATCH : undefined,
  }))
  if (opened.memoryIds.length === 0) {
    return {
      empty: true,
      stats: { turns: 0, toolCalls: 0, rejected: 0, applied: 0 },
      exhausted: false,
      budgetStopped: false,
    }
  }
  const outcome = await runTurns(context, opened, batch)
  if (outcome.stats.turns > 0) {
    await step.do(`${prefix}-${batch}-close`, async () => await finalizeBatch(env, ownerId, {
      runId,
      memoryIds: opened.memoryIds,
      stats: outcome.stats,
      mode: opened.mode,
    }))
  }
  return { ...outcome, empty: false }
}
