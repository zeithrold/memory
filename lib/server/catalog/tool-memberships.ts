import type { ActionRecord, ToolContext } from './tool-common'
import { z } from 'zod'
import {
  checkAssign,
  checkSkip,
  checkUnassign,
} from './policy'
import {
  categoryIdSchema,
  defineTool,
  memoryIdMembership,
  memoryIdSchema,
  now,
  reasonSchema,
  refreshCount,
  rejected,
} from './tool-common'

export const assignTool = defineTool(
  {
    name: 'assign',
    description:
    ('Classify one memory into one existing category. Pass primary: false to add '
      + 'a secondary, cross-cutting membership without moving the memory out of its '
      + 'current category. Call catalog_list first: an unknown category id is refused.'),
    effect: 'immediate',
    schema: z
      .object(
        {

          memoryId: memoryIdSchema,

          categoryId: categoryIdSchema,

          primary: z.boolean().optional().describe('Default true. False adds a secondary membership.'),

          confidence: z.number().min(0).max(1),

          reason: reasonSchema,
        },
      )
      .strict(),
    async run(
      ctx,
      input,
    ) {
      const primary = input.primary !== false
      const verdict = checkAssign({
        snapshot: ctx.snapshot,
        batchMemoryIds: ctx.batchMemoryIds,
        reassignments: ctx.reassignments,
        batchSize: ctx.batchMemoryIds.size,
        memoryId: input.memoryId,
        categoryId: input.categoryId,
        primary,
        confidence: input.confidence,
      })
      const before = ctx.snapshot.memberships.get(input.memoryId) ?? []
      if (!verdict.allowed) {
        return rejected(
          'assign',
          'immediate',
          verdict.reason,
          { memoryId: input.memoryId, categoryId: input.categoryId },
        )
      }

      const action: ActionRecord = {
        kind: 'assign',
        effect: 'immediate',
        decision: ctx.mode === 'dry_run' ? 'proposed' : 'applied',
        memoryId: input.memoryId,
        categoryId: input.categoryId,
        rationale: input.reason,
        before,
        after: { categoryId: input.categoryId, primary, confidence: input.confidence },
      }
      if (ctx.mode === 'dry_run') {
        return {

          result: { ok: true, applied: false, simulated: true, categoryId: input.categoryId, primary },

          action,

          reassigned: verdict.reassigns !== undefined,
        }
      }
      await storeAssignment(ctx, input, primary)
      await refreshCount(ctx, input.categoryId)
      if (verdict.reassigns !== undefined) {
        await refreshCount(ctx, verdict.reassigns.category_id)
      }
      return {
        result: { ok: true, applied: true, categoryId: input.categoryId, primary },
        action,
        reassigned: verdict.reassigns !== undefined,
      }
    },
  },
)

export const confirmMembershipsTool = defineTool(
  {
    name: 'confirm_memberships',
    description:
    ('Confirm that an already-classified memory still belongs in its current '
      + 'categories. Use this during a periodic review when no assignment should change.'),
    effect: 'immediate',
    schema: z.object({ memoryId: memoryIdSchema, reason: reasonSchema }).strict(),
    async run(
      ctx,
      input,
    ) {
      const scopeError = memoryIdMembership(ctx, input.memoryId)
      if (scopeError !== null) {
        return rejected('confirm_memberships', 'immediate', scopeError, { memoryId: input.memoryId })
      }
      const memberships = ctx.snapshot.memberships.get(input.memoryId) ?? []
      if (memberships.length === 0) {
        return rejected(
          'confirm_memberships',
          'immediate',
          'This memory has no membership to confirm. Assign it or skip it instead.',
          { memoryId: input.memoryId },
        )
      }
      const memory = ctx.snapshot.memories.find(row => row.id === input.memoryId)
      if (memory === undefined) {
        return rejected(
          'confirm_memberships',
          'immediate',
          'No such batch memory.',
          { memoryId: input.memoryId },
        )
      }
      const action: ActionRecord = {
        kind: 'confirm_memberships',
        effect: 'immediate',
        decision: ctx.mode === 'dry_run' ? 'proposed' : 'applied',
        memoryId: input.memoryId,
        rationale: input.reason,
        before: memberships,
        after: { reviewedVersion: memory.version },
      }
      if (ctx.mode === 'dry_run') {
        return {
          result: { ok: true, confirmed: false, simulated: true },
          action,
        }
      }
      await ctx.env.DB.prepare(
        `INSERT INTO catalog_memory_reviews(owner_id, memory_id, memory_version, reviewed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_id, memory_id) DO UPDATE SET
         memory_version = excluded.memory_version,
         reviewed_at = excluded.reviewed_at`,
      )
        .bind(ctx.ownerId, input.memoryId, memory.version, now())
        .run()
      return { result: { ok: true, confirmed: true }, action }
    },
  },
)

export const unassignTool = defineTool(
  {
    name: 'unassign',
    description:
    ('Remove one category membership from a memory, for example when a memory was '
      + 'misfiled. Use assign to move a memory; this only removes.'),
    effect: 'immediate',
    schema: z.object({ memoryId: memoryIdSchema, categoryId: categoryIdSchema, reason: reasonSchema })
      .strict(),
    async run(ctx, input) {
      const verdict = checkUnassign({
        snapshot: ctx.snapshot,
        batchMemoryIds: ctx.batchMemoryIds,
        reassignments: ctx.reassignments,
        batchSize: ctx.batchMemoryIds.size,
        memoryId: input.memoryId,
        categoryId: input.categoryId,
      })
      const before = ctx.snapshot.memberships.get(input.memoryId) ?? []
      if (!verdict.allowed) {
        return rejected(
          'unassign',
          'immediate',
          verdict.reason,
          { memoryId: input.memoryId, categoryId: input.categoryId },
        )
      }
      const action: ActionRecord = {
        kind: 'unassign',
        effect: 'immediate',
        decision: ctx.mode === 'dry_run' ? 'proposed' : 'applied',
        memoryId: input.memoryId,
        categoryId: input.categoryId,
        rationale: input.reason,
        before,
        after: { removed: input.categoryId },
      }
      if (ctx.mode === 'dry_run') {
        return { result: { ok: true, applied: false, simulated: true }, action }
      }
      await ctx.env.DB.prepare(
        'DELETE FROM memory_categories WHERE memory_id = ? AND category_id = ?',
      )
        .bind(input.memoryId, input.categoryId)
        .run()
      await refreshCount(ctx, input.categoryId)
      return { result: { ok: true, applied: true }, action }
    },
  },
)

export const skipTool = defineTool(
  {
    name: 'skip',
    description:
    ('Record that a memory should stay unclassified for now, so later runs do not '
      + 'keep proposing the same thing. A skip expires when the memory is edited.'),
    effect: 'immediate',
    schema: z.object({ memoryId: memoryIdSchema, reason: reasonSchema }).strict(),
    async run(
      ctx,
      input,
    ) {
      const verdict = checkSkip({
        snapshot: ctx.snapshot,
        batchMemoryIds: ctx.batchMemoryIds,
        reassignments: ctx.reassignments,
        batchSize: ctx.batchMemoryIds.size,
        memoryId: input.memoryId,
      })
      if (!verdict.allowed) {
        return rejected('skip', 'immediate', verdict.reason, { memoryId: input.memoryId })
      }
      const memory = ctx.snapshot.memories.find(row => row.id === input.memoryId)
      const action: ActionRecord = {
        kind: 'skip',
        effect: 'immediate',
        decision: ctx.mode === 'dry_run' ? 'proposed' : 'skipped',
        memoryId: input.memoryId,
        rationale: input.reason,
      }
      if (ctx.mode === 'dry_run') {
        return { result: { ok: true, applied: false, simulated: true }, action }
      }
      await ctx.env.DB.prepare(
        `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at,
source)
       VALUES (?, ?, ?, ?, 1, ?, 'explicit')
       ON CONFLICT(memory_id) DO UPDATE SET
         reason = excluded.reason,
         memory_version = excluded.memory_version,
         attempts = excluded.attempts,
         created_at = excluded.created_at,
         source = excluded.source`,
      )
        .bind(

          ctx.ownerId,

          input.memoryId,

          input.reason,

          memory?.version ?? 0,

          now(),
        )
        .run()
      return { result: { ok: true, applied: true }, action }
    },
  },
)

interface StoreAssignmentInput { memoryId: string, categoryId: string, confidence: number }

async function storeAssignment(
  ctx: ToolContext,
  input: StoreAssignmentInput,
  primary: boolean,
): Promise<void> {
  const timestamp = now()
  if (primary) {
    // A previous primary is demoted rather than deleted: the catalog stays
    // multi-label, and a later run can promote it back without loss.
    await ctx.env.DB.prepare(
      ('UPDATE memory_categories SET is_primary = 0, updated_at = ? WHERE memory_id '
        + '= ? AND is_primary = 1 AND category_id != ?'),
    )
      .bind(timestamp, input.memoryId, input.categoryId)
      .run()
  }
  await ctx.env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'agent', 1, ?, ?)
       ON CONFLICT(memory_id, category_id) DO UPDATE SET
         is_primary = excluded.is_primary,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
  )
    .bind(
      ctx.ownerId,
      input.memoryId,
      input.categoryId,
      primary ? 1 : 0,
      input.confidence,
      timestamp,
      timestamp,
    )
    .run()
}
