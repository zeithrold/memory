import { z } from 'zod'
import { projectSchema } from '../../contracts'
import {
  checkMerge,
  checkProjectMove,
  checkProposeCategory,
  checkRetire,
  MAX_REASON_LENGTH,
} from './policy'
import { categoryIdSchema, defineTool, memoryIdSchema, reasonSchema, rejected } from './tool-common'
import { recordProposal } from './tool-proposal-store'

export const proposeCategoryTool = defineTool(
  {
    name: 'propose_category',
    description:
    ('Propose a new category, either top level (omit parentId) or nested under '
      + 'one existing top-level category. Nothing changes now: the proposal is '
      + 'applied only after a later run supports it. Every sibling must share one '
      + 'classification axis, and boundary must state what does NOT belong here.'),
    effect: 'proposal',
    schema: z
      .object({
        parentId: categoryIdSchema.nullable().optional(),
        slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        label: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(400),
        boundary: z.string().trim().min(1).max(400),
        axisHint: z.string().trim().min(1).max(80).optional(),
        reason: reasonSchema,
      })
      .strict(),
    async run(
      ctx,
      input,
    ) {
      const parentId = input.parentId ?? null
      const verdict = checkProposeCategory(
        {
          snapshot: ctx.snapshot,
          batchMemoryIds: ctx.batchMemoryIds,
          reassignments: ctx.reassignments,
          batchSize: ctx.batchMemoryIds.size,
        },
        parentId,
      )
      if (!verdict.allowed) {
        return rejected('create_category', 'proposal', verdict.reason)
      }
      const duplicate = ctx.snapshot.categories.find(
        category => category.parent_id === parentId && category.slug === input.slug,
      )
      if (duplicate !== undefined) {
        return rejected(

          'create_category',

          'proposal',

          `A category with slug "${input.slug}" already exists here. Use category id ${duplicate.id} instead.`,

          { categoryId: duplicate.id },
        )
      }
      return await recordProposal(ctx, {
        kind: 'create_category',
        payload: {
          parentId,
          slug: input.slug,
          label: input.label,
          description: input.description,
          boundary: input.boundary,
          axisHint: input.axisHint ?? null,
        },
        rationale: input.reason,
      })
    },
  },
)

export const proposeMergeTool = defineTool(
  {
    name: 'propose_merge',
    description:
    ('Propose folding one category into another because they overlap. Nothing '
      + 'changes now. Use this instead of leaving two categories that split the same '
      + 'memories.'),
    effect: 'proposal',
    schema: z.object({ fromId: categoryIdSchema, intoId: categoryIdSchema, reason: reasonSchema }).strict(),
    async run(ctx, input) {
      const verdict = checkMerge({
        snapshot: ctx.snapshot,
        batchMemoryIds: ctx.batchMemoryIds,
        reassignments: ctx.reassignments,
        batchSize: ctx.batchMemoryIds.size,
        categoryId: input.fromId,
        targetCategoryId: input.intoId,
      })
      if (!verdict.allowed) {
        return rejected('merge_category', 'proposal', verdict.reason)
      }
      return await recordProposal(ctx, {
        kind: 'merge_category',
        categoryId: input.fromId,
        targetCategoryId: input.intoId,
        payload: { fromId: input.fromId, intoId: input.intoId },
        rationale: input.reason,
      })
    },
  },
)

export const proposeRetireTool = defineTool({
  name: 'propose_retire',
  description:
    ('Propose retiring a category that is no longer useful. Its memories are '
      + 're-classified first by the consolidation pass, so nothing is lost.'),
  effect: 'proposal',
  schema: z.object({ categoryId: categoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, input) {
    const verdict = checkRetire({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      categoryId: input.categoryId,
    })
    if (!verdict.allowed) {
      return rejected('retire_category', 'proposal', verdict.reason)
    }
    const category = ctx.snapshot.categories.find(row => row.id === input.categoryId)
    return await recordProposal(ctx, {
      kind: 'retire_category',
      categoryId: input.categoryId,
      payload: { categoryId: input.categoryId, memberCount: category?.member_count ?? 0 },
      rationale: input.reason,
    })
  },
})

export const proposeProjectMoveTool = defineTool(
  {
    name: 'propose_project_move',
    description:
    ('Propose moving one memory to a different project. This never happens '
      + 'automatically: the account owner approves it, because a move changes which '
      + 'project-restricted tokens can see the memory.'),
    effect: 'proposal',
    schema: z
      .object({ memoryId: memoryIdSchema, targetProject: projectSchema, reason: reasonSchema })
      .strict(),
    async run(
      ctx,
      input,
    ) {
      const verdict = checkProjectMove({
        snapshot: ctx.snapshot,
        batchMemoryIds: ctx.batchMemoryIds,
        reassignments: ctx.reassignments,
        batchSize: ctx.batchMemoryIds.size,
        memoryId: input.memoryId,
      })
      if (!verdict.allowed) {
        return rejected('propose_project_move', 'proposal', verdict.reason, { memoryId: input.memoryId })
      }
      const memory = ctx.snapshot.memories.find(row => row.id === input.memoryId)
      if (memory !== undefined && memory.project === input.targetProject) {
        return rejected(
          'propose_project_move',
          'proposal',
          'That memory is already in the requested project.',
          { memoryId: input.memoryId },
        )
      }
      return await recordProposal(
        ctx,
        {

          kind: 'project_move',

          memoryId: input.memoryId,

          targetProject: input.targetProject,

          payload: { memoryId: input.memoryId, from: memory?.project ?? null, to: input.targetProject },

          rationale: input.reason,
        },
      )
    },
  },
)

export const finishTool = defineTool({
  name: 'finish',
  description:
    ('End this batch. Call it once every memory in the batch has been classified, '
      + 'skipped, or deliberately left for a proposal. The summary is shown to the '
      + 'account owner.'),
  effect: 'control',
  schema: z.object({ summary: z.string().trim().min(1).max(MAX_REASON_LENGTH) }).strict(),
  run(_ctx, input) {
    return {
      result: { ok: true, finished: true },
      finished: true,
      action: {
        kind: 'finish',
        effect: 'control',
        decision: 'applied',
        rationale: input.summary,
      },
    }
  },
})
