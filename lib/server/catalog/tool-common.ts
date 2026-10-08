import type { Env } from '../env'
import type { CatalogSnapshot } from './model'
import { z } from 'zod'
import {
  MAX_REASON_LENGTH,
} from './policy'

/**
 * The agent's entire vocabulary. Every declaration drives both the schema the
 * model sees and the code that runs, so a description cannot drift from the
 * behaviour it describes.
 *
 * There is deliberately no memory delete, no raw SQL, and no arbitrary fetch.
 * Effects are confined to the catalog tables; the single exception is a project
 * move, which stays a proposal until a human approves it.
 *
 * `effect` decides what may happen immediately:
 * - `read`     — no side effect, never recorded as an action (D1 writes cost
 *                1000x reads, so read traffic stays out of the audit log);
 * - `immediate`— per-memory and reversible, applied now;
 * - `proposal` — structural, backlogged for consolidation, never applied here;
 * - `control`  — ends the batch.
 */
export type ToolEffect = 'read' | 'immediate' | 'proposal' | 'control'

export type ToolContext = {
  env: Env
  ownerId: string
  runId: string
  batch: number
  turn: number
  callIndex: number
  mode: 'live' | 'dry_run'
  includeContent: boolean
  snapshot: CatalogSnapshot
  batchMemoryIds: Set<string>
  /** Re-classifications already applied in this batch. */
  reassignments: number
}

export type ActionDecision = 'applied' | 'proposed' | 'rejected_by_policy' | 'rejected_by_user' | 'skipped'

export type ActionRecord = {
  kind: string
  effect: ToolEffect
  decision: ActionDecision
  policyReason?: string
  memoryId?: string
  categoryId?: string
  targetCategoryId?: string
  targetProject?: string
  rationale?: string
  before?: unknown
  after?: unknown
}

export type ToolOutcome = {
  /** What the model is told. A rejection is a result, not an exception. */
  result: Record<string, unknown>
  action?: ActionRecord
  /** Set by `assign` so the caller can keep the churn budget accurate. */
  reassigned?: boolean
  /** Set by `finish`, `skip`-only turns, or an explicit give-up. */
  finished?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  effect: ToolEffect
  schema: z.ZodType
  /** Only offered when the operator opts in (see `toolsFor`). */
  optional?: boolean
  run: (ctx: ToolContext, args: unknown) => Promise<ToolOutcome>
}

export const reasonSchema = z.string().trim().min(1).max(MAX_REASON_LENGTH)

export const memoryIdSchema = z.uuid()

export const categoryIdSchema = z.uuid()

export function rejected(
  kind: string,
  effect: ToolEffect,
  reason: string,
  extra: Partial<ActionRecord> = {},
): ToolOutcome {
  return {
    result: { ok: false, rejected: true, reason },
    action: { kind, effect, decision: 'rejected_by_policy', policyReason: reason, ...extra },
  }
}

export function now(): string {
  return new Date().toISOString()
}

/** Recomputes the materialised member count for one category. */
export async function refreshCount(ctx: ToolContext, categoryId: string): Promise<void> {
  await ctx.env.DB.prepare(
    ('UPDATE categories SET member_count = (SELECT count(*) FROM '
      + 'memory_categories WHERE category_id = categories.id), updated_at = ? WHERE '
      + 'id = ?'),
  )
    .bind(now(), categoryId)
    .run()
}

export function memoryIdMembership(ctx: ToolContext, memoryId: string): string | null {
  if (!ctx.batchMemoryIds.has(memoryId)) {
    return 'That memory is not part of the current batch.'
  }
  return null
}

/** Keeps each implementation tied to the schema that validates its arguments. */
type DefineToolDefinition<S extends z.ZodType> = {
  name: string
  description: string
  effect: ToolEffect
  schema: S
  optional?: boolean
  run: (ctx: ToolContext, input: z.output<S>) => ToolOutcome | Promise<ToolOutcome>
}

export function defineTool<S extends z.ZodType>(
  definition: DefineToolDefinition<S>,
): ToolDefinition {
  return {
    ...definition,
    async run(ctx, args) {
      return await definition.run(ctx, definition.schema.parse(args))
    },
  }
}
