/**
 * Run orchestration, kept as plain functions so the Workflow is a thin shell
 * over testable service code.
 *
 * Every function here is written to be safe to call twice: the Workflows engine
 * retries a step whenever it is not certain the step finished, so "did this
 * already happen" is answered from D1 rather than from memory.
 */
/**
 * Step budget arithmetic for the Workers Free plan, which allows 3,000
 * Workflow steps per day.
 *
 * One owner costs at most 1 (claim) + batches x (1 + 2 per turn + 1) + 2
 * (consolidate, finish). With two owners, two batches and two turns that is
 * 30 steps per firing, and a firing every 30 minutes gives 48 x 30 = 1,440
 * steps per day. Idle windows create no Workflow at all.
 *
 * Raising either cap without redoing this arithmetic spends a day's budget
 * before the day is over; the queue is ordered by `next_run_at`, so accounts
 * take turns instead of being served simultaneously.
 */
export const MAX_OWNERS_PER_FIRING = 2

export const MAX_BATCHES_PER_RUN = 2

export const MAX_STEPS_PER_FIRING = 32

export const SCHEDULED_DRY_RUN_MAX_BATCH = 6

/**
 * How often a catalog run is dispatched. A Cron Trigger fires this Worker every
 * minute, and only the windows on this boundary start an instance.
 */
export const CATALOG_CADENCE_MINUTES = 30

/** A run left in `running` beyond this is treated as abandoned. */
export const STALE_RUN_MINUTES = 15

export const MANUAL_DEDUPE_SECONDS = 60

export function isoNow(): string {
  return new Date().toISOString()
}

export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export type DueOwner = {
  ownerId: string
  dryRun: boolean
}

export type DailyCatalogUsage = {
  tokens: number
  turns: number
  missingTurns: number
}
