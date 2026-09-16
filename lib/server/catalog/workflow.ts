import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../env'
import type { BatchStats } from './run'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { AppError } from '../errors'
import {
  claimRun,
  consolidate,
  dueOwners,
  finalizeBatch,
  finishRun,
  MAX_BATCHES_PER_RUN,
  MAX_OWNERS_PER_FIRING,
  startBatch,
} from './run'
import { actTurn, thinkTurn } from './turn'

/**
 * Parameters for a run. A scheduled firing carries an empty payload; a manual
 * run passes the owner, so the instance and the audit record share one identity.
 */
export interface CatalogWorkflowParams {
  ownerId?: string
  /**
   * Set by the manual trigger, whose API already created the run row. Without
   * it the workflow claims a run itself, which is what a scheduled firing does.
   */
  runId?: string
  dryRun?: boolean
}

/**
 * Durable casing for the catalog maintenance job.
 *
 * Two properties make this safe to retry:
 *
 * 1. Every side effect is inside a step. The `run` body itself is re-executed
 *    on replay, so it holds no mutable state and derives each step name only
 *    from values a previous step returned - never from the clock or a random
 *    value. Identifiers are minted inside the step that records them, which is
 *    why a replayed claim returns the same run id.
 * 2. Each half of a turn is its own step, so a retry can never pay for the same
 *    model call twice: `thinkTurn` and `actTurn` answer "did this already
 *    happen" from the audit tables. See the rules of Workflows on granular
 *    steps and on holding no state outside a step.
 *
 * The conversation itself never travels in step state; only memory identifiers
 * do. The transcript is rebuilt inside the step that needs it, so memory text
 * and the decrypted credential stay out of Workflow instance storage, which is
 * retained for days.
 */
export class CatalogWorkflow extends WorkflowEntrypoint<
  Env,
  CatalogWorkflowParams
> {
  override async run(
    event: Readonly<WorkflowEvent<CatalogWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const requested = event.payload.ownerId
    if (requested !== undefined && requested.length > 0) {
      return this.runOwner(
        step,
        requested,
        'manual',
        event.payload.dryRun === true,
        'run',
        event.payload.runId,
      )
    }

    const due = await step.do('due-owners', async () =>
      dueOwners(this.env, MAX_OWNERS_PER_FIRING))
    const owners: unknown[] = []
    for (const [index, owner] of due.entries()) {
      owners.push(
        await this.runOwner(step, owner.ownerId, 'schedule', owner.dryRun, `owner-${index}`),
      )
    }
    return { scheduled: due.length, owners }
  }

  private async runOwner(
    step: WorkflowStep,
    ownerId: string,
    trigger: 'schedule' | 'manual',
    dryRun: boolean,
    prefix: string,
    existingRunId?: string,
  ): Promise<unknown> {
    // A manual run arrives with its row already created, so that the API can
    // return an identifier before the instance has even started.
    const claim = existingRunId === undefined
      ? await step.do(`${prefix}-claim`, async () => claimRun(this.env, ownerId, trigger, dryRun))
      : { runId: existingRunId, reused: false, dryRun }
    if (claim.reused)
      return { ownerId, runId: claim.runId, outcome: 'already-running' }

    const runId = claim.runId
    const totals: BatchStats = { turns: 0, toolCalls: 0, rejected: 0, applied: 0 }
    let exhausted = false
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const opened = await step.do(`${prefix}-${batch}-open`, async () =>
          startBatch(this.env, ownerId, runId, dryRun))
        if (opened.memoryIds.length === 0)
          break
        const memoryIds = opened.memoryIds
        const batchStats: BatchStats = { turns: 0, toolCalls: 0, rejected: 0, applied: 0 }
        let reassignments = 0
        let rejectedStreak = 0
        let closed = false
        for (let turn = 0; turn < opened.maxTurns; turn++) {
          const input = {
            env: this.env,
            ownerId,
            runId,
            batch,
            turn,
            mode: opened.mode,
            includeContent: opened.includeContent,
            maxToolCalls: opened.maxToolCalls,
            memoryIds,
          }
          // The model call carries the retry policy and the timeout. The tool
          // step deliberately does not retry: a retry there is answered by the
          // idempotency journal rather than by calling the provider again.
          const thought = await step.do(
            `${prefix}-${batch}-${turn}-think`,
            {
              retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
              timeout: '5 minutes',
            },
            async () => thinkTurn(input),
          )
          batchStats.turns += 1
          batchStats.toolCalls += thought.toolCallCount
          if (thought.noToolCalls) {
            // The model answered in prose instead of acting, so there is
            // nothing more this batch can accomplish.
            closed = true
            break
          }
          const acted = await step.do(`${prefix}-${batch}-${turn}-act`, async () =>
            actTurn(input, reassignments))
          reassignments += acted.reassignments
          batchStats.applied += acted.applied
          batchStats.rejected += acted.rejected
          if (acted.finished || acted.stalled) {
            closed = true
            break
          }
          // Two consecutive turns in which every call was refused means the
          // agent is stuck; stop instead of spending the rest of the budget.
          rejectedStreak = acted.applied === 0 && acted.rejected > 0 ? rejectedStreak + 1 : 0
          if (rejectedStreak >= 2) {
            exhausted = true
            closed = true
            break
          }
        }
        if (!closed)
          exhausted = true
        await step.do(`${prefix}-${batch}-close`, async () =>
          finalizeBatch(this.env, ownerId, runId, memoryIds, batchStats))
        totals.turns += batchStats.turns
        totals.toolCalls += batchStats.toolCalls
        totals.rejected += batchStats.rejected
        totals.applied += batchStats.applied
      }
      await step.do(`${prefix}-consolidate`, async () =>
        consolidate(this.env, ownerId, runId))
      await step.do(`${prefix}-finish`, async () =>
        finishRun(this.env, ownerId, runId, exhausted ? 'partial' : 'succeeded'))
      return { ownerId, runId, outcome: exhausted ? 'partial' : 'complete', totals }
    }
    catch (error) {
      // A run must not stay `running` just because a step gave up: an abandoned
      // run blocks the account until it is treated as stale.
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR'
      await step.do(`${prefix}-fail`, async () =>
        finishRun(this.env, ownerId, runId, 'failed', code))
      throw error
    }
  }
}
