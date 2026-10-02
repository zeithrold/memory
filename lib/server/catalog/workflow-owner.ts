import type { WorkflowStepConfig } from 'cloudflare:workers'
import type { Env } from '../env'
import { AppError } from '../errors'
import { claimRun, consolidate, finishRun } from './run'
import { runBatches } from './workflow-batches'

export interface RunOwnerOptions {
  trigger: 'schedule' | 'manual'
  dryRun: boolean
  prefix: string
  existingRunId?: string
  scheduledAt?: number
}

export interface WorkflowContext {
  env: Env
  step: WorkflowSteps
  ownerId: string
  runId: string
  options: RunOwnerOptions
}

export async function runOwner(
  env: Env,
  step: WorkflowSteps,
  ownerId: string,
  options: RunOwnerOptions,
): Promise<unknown> {
  const { trigger, dryRun, prefix, existingRunId, scheduledAt } = options
  const claim = existingRunId === undefined
    ? await step.do(`${prefix}-claim`, async () => await claimRun(env, ownerId, { trigger, dryRun }))
    : { runId: existingRunId, reused: false, dryRun, budgetWarning: false }
  if (claim.reused) {
    return { ownerId, runId: claim.runId, outcome: 'already-running' }
  }
  const runId = claim.runId
  try {
    const { totals, exhausted, budgetStopped } = await runBatches({ env, step, ownerId, runId, options })
    if (!claim.dryRun) {
      await step.do(`${prefix}-consolidate`, async () => await consolidate(env, ownerId, runId))
    }
    await step.do(`${prefix}-finish`, async () => await finishRun(env, ownerId, {
      runId,
      status: exhausted ? 'partial' : 'succeeded',
      errorCode: budgetStopped ? 'DAILY_TOKEN_BUDGET' : undefined,
      scheduledAt,
    }))
    return { ownerId, runId, outcome: exhausted ? 'partial' : 'complete', totals }
  }
  catch (error) {
    await step.do(`${prefix}-fail`, async () => await finishRun(env, ownerId, {
      runId,
      status: 'failed',
      errorCode: failureCode(error),
      scheduledAt,
    }))
    throw error
  }
}

function failureCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code
  }
  if (error instanceof Error && /^[A-Z_]+:/.test(error.message)) {
    return error.message.slice(0, error.message.indexOf(':'))
  }
  return 'INTERNAL_ERROR'
}

/** The journal operations this workflow uses; Cloudflare supplies this interface. */
export interface WorkflowSteps {
  do: (<T extends Rpc.Serializable<T>>(name: string, operation: () => Promise<T>) => Promise<T>)
    & (<T extends Rpc.Serializable<T>>(
      name: string,
      config: WorkflowStepConfig,
      operation: () => Promise<T>,
    ) => Promise<T>)
}
