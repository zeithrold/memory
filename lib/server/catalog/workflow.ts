import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../env'
import type { DueOwner } from './run'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import {
  dueOwners,
  MAX_OWNERS_PER_FIRING,
} from './run'
import { runOwner } from './workflow-owner'

/**
 * Parameters for a run. A scheduled firing carries its cadence-window time; a
 * manual run passes the owner, so the instance and audit record share one identity.
 */
export type CatalogWorkflowParams = {
  ownerId?: string
  /** Exact Cron window used to keep recurring runs on the cadence grid. */
  scheduledAt?: number
  /**
   * Set by the manual trigger, whose API already created the run row. Without
   * it the workflow claims a run itself, which is what a scheduled firing does.
   */
  runId?: string
  dryRun?: boolean
  /** Preflighted by the Cron handler so an idle window creates no instance. */
  owners?: DueOwner[]
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
      return await runOwner(
        this.env,
        step,
        requested,
        {
          trigger: 'manual',
          dryRun: event.payload.dryRun === true,
          prefix: 'run',
          existingRunId: event.payload.runId,
          scheduledAt: undefined,
        },
      )
    }

    // New dispatches carry the preflighted owners and spend no Workflow step on
    // discovery. The step fallback keeps already-created legacy instances
    // replayable across a deployment.
    const due = event.payload.owners ?? await step.do('due-owners', async () =>
      await dueOwners(this.env, MAX_OWNERS_PER_FIRING))
    const owners: unknown[] = []
    for (const [index, owner] of due.entries()) {
      owners.push(
        await runOwner(
          this.env,
          step,
          owner.ownerId,
          {
            trigger: 'schedule',
            dryRun: owner.dryRun,
            prefix: `owner-${index}`,
            existingRunId: undefined,
            scheduledAt: event.payload.scheduledAt,
          },
        ),
      )
    }
    return { scheduled: due.length, owners }
  }
}
