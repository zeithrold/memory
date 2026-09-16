import type { Env } from '../env'
import type { ToolSpec } from '../llm'
import type { BatchMemory, CatalogSnapshot } from './model'
import { z } from 'zod'
import { projectSchema } from '../../contracts'
import { AppError } from '../errors'
import { ftsQuery } from '../search'
import { loadBatchMemories } from './model'
import {
  checkAssign,
  checkMerge,
  checkProjectMove,
  checkProposeCategory,
  checkRetire,
  checkSkip,
  checkUnassign,
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

export interface ToolContext {
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

export interface ActionRecord {
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

export interface ToolOutcome {
  /** What the model is told. A rejection is a result, not an exception. */
  result: Record<string, unknown>
  action?: ActionRecord
  /** Set by `assign` so the caller can keep the churn budget accurate. */
  reassigned?: boolean
  /** Set by `finish`, `skip`-only turns, or an explicit give-up. */
  finished?: boolean
}

interface ToolDefinition {
  name: string
  description: string
  effect: ToolEffect
  schema: z.ZodType
  /** Only offered when the operator opts in (see `toolsFor`). */
  optional?: boolean
  run: (ctx: ToolContext, args: never) => Promise<ToolOutcome>
}

const reasonSchema = z.string().trim().min(1).max(MAX_REASON_LENGTH)
const memoryIdSchema = z.string().uuid()
const categoryIdSchema = z.string().uuid()

function rejected(
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

function now(): string {
  return new Date().toISOString()
}

/** Recomputes the materialised member count for one category. */
async function refreshCount(ctx: ToolContext, categoryId: string): Promise<void> {
  await ctx.env.DB.prepare(
    'UPDATE categories SET member_count = (SELECT count(*) FROM memory_categories WHERE category_id = categories.id), updated_at = ? WHERE id = ?',
  )
    .bind(now(), categoryId)
    .run()
}

const assignTool: ToolDefinition = {
  name: 'assign',
  description:
    'Classify one memory into one existing category. Pass primary: false to add a secondary, cross-cutting membership without moving the memory out of its current category. Call catalog_list first: an unknown category id is refused.',
  effect: 'immediate',
  schema: z
    .object({
      memoryId: memoryIdSchema,
      categoryId: categoryIdSchema,
      primary: z.boolean().optional().describe('Default true. False adds a secondary membership.'),
      confidence: z.number().min(0).max(1),
      reason: reasonSchema,
    })
    .strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string, categoryId: string, primary?: boolean, confidence: number, reason: string }
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
    if (!verdict.allowed)
      return rejected('assign', 'immediate', verdict.reason, { memoryId: input.memoryId, categoryId: input.categoryId })

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
    const timestamp = now()
    if (primary) {
      // A previous primary is demoted rather than deleted: the catalog stays
      // multi-label, and a later run can promote it back without loss.
      await ctx.env.DB.prepare(
        'UPDATE memory_categories SET is_primary = 0, updated_at = ? WHERE memory_id = ? AND is_primary = 1 AND category_id != ?',
      )
        .bind(timestamp, input.memoryId, input.categoryId)
        .run()
    }
    await ctx.env.DB.prepare(
      `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'agent', 1, ?, ?)
       ON CONFLICT(memory_id, category_id) DO UPDATE SET
         is_primary = excluded.is_primary,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
    )
      .bind(ctx.ownerId, input.memoryId, input.categoryId, primary ? 1 : 0, input.confidence, timestamp, timestamp)
      .run()
    await refreshCount(ctx, input.categoryId)
    if (verdict.reassigns !== undefined)
      await refreshCount(ctx, verdict.reassigns.category_id)
    return {
      result: { ok: true, applied: true, categoryId: input.categoryId, primary },
      action,
      reassigned: verdict.reassigns !== undefined,
    }
  },
}

const confirmMembershipsTool: ToolDefinition = {
  name: 'confirm_memberships',
  description:
    'Confirm that an already-classified memory still belongs in its current categories. Use this during a periodic review when no assignment should change.',
  effect: 'immediate',
  schema: z.object({ memoryId: memoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string, reason: string }
    const scopeError = memoryIdMembership(ctx, input.memoryId)
    if (scopeError !== null)
      return rejected('confirm_memberships', 'immediate', scopeError, { memoryId: input.memoryId })
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
    if (memory === undefined)
      return rejected('confirm_memberships', 'immediate', 'No such batch memory.', { memoryId: input.memoryId })
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
}

const unassignTool: ToolDefinition = {
  name: 'unassign',
  description:
    'Remove one category membership from a memory, for example when a memory was misfiled. Use assign to move a memory; this only removes.',
  effect: 'immediate',
  schema: z.object({ memoryId: memoryIdSchema, categoryId: categoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string, categoryId: string, reason: string }
    const verdict = checkUnassign({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      memoryId: input.memoryId,
      categoryId: input.categoryId,
    })
    const before = ctx.snapshot.memberships.get(input.memoryId) ?? []
    if (!verdict.allowed)
      return rejected('unassign', 'immediate', verdict.reason, { memoryId: input.memoryId, categoryId: input.categoryId })
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
    if (ctx.mode === 'dry_run')
      return { result: { ok: true, applied: false, simulated: true }, action }
    await ctx.env.DB.prepare(
      'DELETE FROM memory_categories WHERE memory_id = ? AND category_id = ?',
    )
      .bind(input.memoryId, input.categoryId)
      .run()
    await refreshCount(ctx, input.categoryId)
    return { result: { ok: true, applied: true }, action }
  },
}

const skipTool: ToolDefinition = {
  name: 'skip',
  description:
    'Record that a memory should stay unclassified for now, so later runs do not keep proposing the same thing. A skip expires when the memory is edited.',
  effect: 'immediate',
  schema: z.object({ memoryId: memoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string, reason: string }
    const verdict = checkSkip({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      memoryId: input.memoryId,
    })
    if (!verdict.allowed)
      return rejected('skip', 'immediate', verdict.reason, { memoryId: input.memoryId })
    const memory = ctx.snapshot.memories.find(row => row.id === input.memoryId)
    const action: ActionRecord = {
      kind: 'skip',
      effect: 'immediate',
      decision: ctx.mode === 'dry_run' ? 'proposed' : 'skipped',
      memoryId: input.memoryId,
      rationale: input.reason,
    }
    if (ctx.mode === 'dry_run')
      return { result: { ok: true, applied: false, simulated: true }, action }
    await ctx.env.DB.prepare(
      `INSERT INTO catalog_skips(owner_id, memory_id, reason, memory_version, attempts, created_at, source)
       VALUES (?, ?, ?, ?, 1, ?, 'explicit')
       ON CONFLICT(memory_id) DO UPDATE SET
         reason = excluded.reason,
         memory_version = excluded.memory_version,
         attempts = excluded.attempts,
         created_at = excluded.created_at,
         source = excluded.source`,
    )
      .bind(ctx.ownerId, input.memoryId, input.reason, memory?.version ?? 0, now())
      .run()
    return { result: { ok: true, applied: true }, action }
  },
}

/**
 * Structural tools share one path: they always backlog a proposal, and never
 * touch `categories` or `memory_categories`. Equivalent proposals accumulate
 * evidence across runs instead of piling up as duplicates.
 */
async function recordProposal(
  ctx: ToolContext,
  proposal: {
    kind: 'create_category' | 'merge_category' | 'retire_category' | 'project_move'
    categoryId?: string
    targetCategoryId?: string
    memoryId?: string
    targetProject?: string
    payload: Record<string, unknown>
    rationale: string
  },
): Promise<ToolOutcome> {
  const existing = await findEquivalentProposal(ctx, proposal)

  const timestamp = now()
  const action: ActionRecord = {
    kind: proposal.kind,
    effect: 'proposal',
    decision: 'proposed',
    policyReason: undefined,
    memoryId: proposal.memoryId,
    categoryId: proposal.categoryId,
    targetCategoryId: proposal.targetCategoryId,
    targetProject: proposal.targetProject,
    rationale: proposal.rationale,
    after: proposal.payload,
  }
  if (ctx.mode === 'dry_run') {
    return {
      result: {
        ok: true,
        recorded: false,
        simulated: true,
        note: 'Proposals are not recorded during a dry run.',
      },
      action,
    }
  }
  if (existing !== null) {
    const inserted = await recordProposalEvidence(ctx, existing.id)
    if (inserted) {
      await ctx.env.DB.prepare(
        `UPDATE catalog_proposals
         SET evidence_runs = (SELECT count(*) FROM catalog_proposal_evidence WHERE proposal_id = ?),
             last_run_id = ?, payload_json = ?, rationale = ?
         WHERE id = ?`,
      )
        .bind(existing.id, ctx.runId, JSON.stringify(proposal.payload), proposal.rationale, existing.id)
        .run()
    }
    const evidence = await ctx.env.DB.prepare(
      'SELECT evidence_runs FROM catalog_proposals WHERE id = ?',
    )
      .bind(existing.id)
      .first<{ evidence_runs: number }>()
    return {
      result: {
        ok: true,
        recorded: true,
        proposalId: existing.id,
        evidenceRuns: evidence?.evidence_runs ?? existing.evidence_runs,
        evidenceAdded: inserted,
        note: inserted
          ? 'An equivalent proposal already existed; a new run of evidence was recorded.'
          : 'This run already supported the equivalent proposal; its evidence count was unchanged.',
      },
      action,
    }
  }
  const id = crypto.randomUUID()
  await ctx.env.DB.prepare(
    `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id, target_category_id, memory_id, target_project, payload_json, rationale, evidence_runs, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?)`,
  )
    .bind(
      id,
      ctx.ownerId,
      ctx.runId,
      ctx.runId,
      proposal.kind,
      proposal.categoryId ?? null,
      proposal.targetCategoryId ?? null,
      proposal.memoryId ?? null,
      proposal.targetProject ?? null,
      JSON.stringify(proposal.payload),
      proposal.rationale,
      timestamp,
    )
    .run()
  await recordProposalEvidence(ctx, id)
  return {
    result: {
      ok: true,
      recorded: true,
      proposalId: id,
      note: 'Recorded for consolidation. A second run must support it before it is applied.',
    },
    action,
  }
}

interface ProposalCandidate {
  kind: 'create_category' | 'merge_category' | 'retire_category' | 'project_move'
  categoryId?: string
  targetCategoryId?: string
  memoryId?: string
  targetProject?: string
  payload: Record<string, unknown>
}

async function findEquivalentProposal(
  ctx: ToolContext,
  proposal: ProposalCandidate,
): Promise<{ id: string, evidence_runs: number } | null> {
  const base = `SELECT id, evidence_runs FROM catalog_proposals
    WHERE owner_id = ? AND kind = ? AND status = 'pending'`
  if (proposal.kind === 'create_category') {
    return ctx.env.DB.prepare(
      `${base}
       AND COALESCE(json_extract(payload_json, '$.parentId'), '') = COALESCE(?, '')
       AND lower(json_extract(payload_json, '$.slug')) = ?`,
    )
      .bind(
        ctx.ownerId,
        proposal.kind,
        proposal.payload.parentId ?? null,
        String(proposal.payload.slug).trim().toLowerCase(),
      )
      .first<{ id: string, evidence_runs: number }>()
  }
  if (proposal.kind === 'merge_category') {
    return ctx.env.DB.prepare(`${base} AND category_id = ? AND target_category_id = ?`)
      .bind(ctx.ownerId, proposal.kind, proposal.categoryId, proposal.targetCategoryId)
      .first<{ id: string, evidence_runs: number }>()
  }
  if (proposal.kind === 'retire_category') {
    return ctx.env.DB.prepare(`${base} AND category_id = ?`)
      .bind(ctx.ownerId, proposal.kind, proposal.categoryId)
      .first<{ id: string, evidence_runs: number }>()
  }
  return ctx.env.DB.prepare(`${base} AND memory_id = ? AND target_project = ?`)
    .bind(ctx.ownerId, proposal.kind, proposal.memoryId, proposal.targetProject)
    .first<{ id: string, evidence_runs: number }>()
}

async function recordProposalEvidence(ctx: ToolContext, proposalId: string): Promise<boolean> {
  const result = await ctx.env.DB.prepare(
    `INSERT OR IGNORE INTO catalog_proposal_evidence(proposal_id, run_id, created_at)
     VALUES (?, ?, ?)`,
  )
    .bind(proposalId, ctx.runId, now())
    .run()
  return (result.meta.changes ?? 0) > 0
}

const proposeCategoryTool: ToolDefinition = {
  name: 'propose_category',
  description:
    'Propose a new category, either top level (omit parentId) or nested under one existing top-level category. Nothing changes now: the proposal is applied only after a later run supports it. Every sibling must share one classification axis, and boundary must state what does NOT belong here.',
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
  async run(ctx, args) {
    const input = args as { parentId?: string | null, slug: string, label: string, description: string, boundary: string, axisHint?: string, reason: string }
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
    if (!verdict.allowed)
      return rejected('create_category', 'proposal', verdict.reason)
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
    return recordProposal(ctx, {
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
}

const proposeMergeTool: ToolDefinition = {
  name: 'propose_merge',
  description:
    'Propose folding one category into another because they overlap. Nothing changes now. Use this instead of leaving two categories that split the same memories.',
  effect: 'proposal',
  schema: z.object({ fromId: categoryIdSchema, intoId: categoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, args) {
    const input = args as { fromId: string, intoId: string, reason: string }
    const verdict = checkMerge({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      categoryId: input.fromId,
      targetCategoryId: input.intoId,
    })
    if (!verdict.allowed)
      return rejected('merge_category', 'proposal', verdict.reason)
    return recordProposal(ctx, {
      kind: 'merge_category',
      categoryId: input.fromId,
      targetCategoryId: input.intoId,
      payload: { fromId: input.fromId, intoId: input.intoId },
      rationale: input.reason,
    })
  },
}

const proposeRetireTool: ToolDefinition = {
  name: 'propose_retire',
  description:
    'Propose retiring a category that is no longer useful. Its memories are re-classified first by the consolidation pass, so nothing is lost.',
  effect: 'proposal',
  schema: z.object({ categoryId: categoryIdSchema, reason: reasonSchema }).strict(),
  async run(ctx, args) {
    const input = args as { categoryId: string, reason: string }
    const verdict = checkRetire({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      categoryId: input.categoryId,
    })
    if (!verdict.allowed)
      return rejected('retire_category', 'proposal', verdict.reason)
    const category = ctx.snapshot.categories.find(row => row.id === input.categoryId)
    return recordProposal(ctx, {
      kind: 'retire_category',
      categoryId: input.categoryId,
      payload: { categoryId: input.categoryId, memberCount: category?.member_count ?? 0 },
      rationale: input.reason,
    })
  },
}

const proposeProjectMoveTool: ToolDefinition = {
  name: 'propose_project_move',
  description:
    'Propose moving one memory to a different project. This never happens automatically: the account owner approves it, because a move changes which project-restricted tokens can see the memory.',
  effect: 'proposal',
  schema: z
    .object({ memoryId: memoryIdSchema, targetProject: projectSchema, reason: reasonSchema })
    .strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string, targetProject: string, reason: string }
    const verdict = checkProjectMove({
      snapshot: ctx.snapshot,
      batchMemoryIds: ctx.batchMemoryIds,
      reassignments: ctx.reassignments,
      batchSize: ctx.batchMemoryIds.size,
      memoryId: input.memoryId,
    })
    if (!verdict.allowed)
      return rejected('propose_project_move', 'proposal', verdict.reason, { memoryId: input.memoryId })
    const memory = ctx.snapshot.memories.find(row => row.id === input.memoryId)
    if (memory !== undefined && memory.project === input.targetProject) {
      return rejected(
        'propose_project_move',
        'proposal',
        'That memory is already in the requested project.',
        { memoryId: input.memoryId },
      )
    }
    return recordProposal(ctx, {
      kind: 'project_move',
      memoryId: input.memoryId,
      targetProject: input.targetProject,
      payload: { memoryId: input.memoryId, from: memory?.project ?? null, to: input.targetProject },
      rationale: input.reason,
    })
  },
}

const finishTool: ToolDefinition = {
  name: 'finish',
  description:
    'End this batch. Call it once every memory in the batch has been classified, skipped, or deliberately left for a proposal. The summary is shown to the account owner.',
  effect: 'control',
  schema: z.object({ summary: z.string().trim().min(1).max(MAX_REASON_LENGTH) }).strict(),
  async run(ctx, args) {
    const input = args as { summary: string }
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
}

const catalogOverviewTool: ToolDefinition = {
  name: 'catalog_overview',
  description:
    'Read the shape of the catalog: how many categories and memories it holds, how many memories are still unclassified, and the largest categories. Start here when you are unsure what the catalog looks like.',
  effect: 'read',
  schema: z.object({}).strict(),
  async run(ctx) {
    const total = await ctx.env.DB.prepare(
      'SELECT count(*) AS n FROM memories WHERE owner_id = ? AND deleted = 0',
    )
      .bind(ctx.ownerId)
      .first<{ n: number }>()
    const classified = await ctx.env.DB.prepare(
      'SELECT count(DISTINCT memory_id) AS n FROM memory_categories WHERE owner_id = ?',
    )
      .bind(ctx.ownerId)
      .first<{ n: number }>()
    const categories = [...ctx.snapshot.categories]
      .sort((left, right) => right.member_count - left.member_count)
      .slice(0, 10)
      .map(category => ({ id: category.id, label: category.label, members: category.member_count }))
    return {
      result: {
        categories: ctx.snapshot.categories.length,
        topLevel: ctx.snapshot.categories.filter(category => category.depth === 1).length,
        memories: total?.n ?? 0,
        unclassified: Math.max(0, (total?.n ?? 0) - (classified?.n ?? 0)),
        largestCategories: categories,
      },
    }
  },
}

const catalogListTool: ToolDefinition = {
  name: 'catalog_list',
  description:
    'List categories with the description and boundary that define them. Read this before assigning, because an unknown category id is refused.',
  effect: 'read',
  schema: z.object({ parentId: categoryIdSchema.nullable().optional() }).strict(),
  async run(ctx, args) {
    const input = args as { parentId?: string | null }
    const parentId = input.parentId ?? null
    const rows = ctx.snapshot.categories
      .filter(category => category.parent_id === parentId)
      .map(category => ({
        id: category.id,
        slug: category.slug,
        label: category.label,
        description: category.description,
        boundary: category.boundary,
        members: category.member_count,
        depth: category.depth,
      }))
    return { result: { categories: rows } }
  },
}

const catalogMembersTool: ToolDefinition = {
  name: 'catalog_members',
  description:
    'List memories currently inside a category, to judge whether a memory belongs there or whether two categories overlap.',
  effect: 'read',
  schema: z.object({ categoryId: categoryIdSchema, limit: z.number().int().min(1).max(50).optional() }).strict(),
  async run(ctx, args) {
    const input = args as { categoryId: string, limit?: number }
    const rows = await ctx.env.DB.prepare(
      `SELECT m.id, m.title, m.kind, m.project
       FROM memory_categories mc JOIN memories m ON m.id = mc.memory_id
       WHERE mc.category_id = ? AND mc.owner_id = ? AND m.deleted = 0
       ORDER BY mc.is_primary DESC, m.updated_at DESC LIMIT ?`,
    )
      .bind(input.categoryId, ctx.ownerId, input.limit ?? 20)
      .all<{ id: string, title: string, kind: string, project: string }>()
    return { result: { memories: rows.results } }
  },
}

const batchListTool: ToolDefinition = {
  name: 'batch_list',
  description: 'List the memories waiting in this batch, with their current categories.',
  effect: 'read',
  schema: z.object({}).strict(),
  async run(ctx) {
    return {
      result: {
        memories: ctx.snapshot.memories.map(memory => ({
          id: memory.id,
          title: memory.title,
          kind: memory.kind,
          tags: memory.tags,
          project: memory.project,
          categories: (ctx.snapshot.memberships.get(memory.id) ?? []).map(row => row.category_id),
        })),
      },
    }
  },
}

const memoryLookupTool: ToolDefinition = {
  name: 'memory_lookup',
  description: 'Read one memory from this batch in full before deciding where it belongs.',
  effect: 'read',
  schema: z.object({ memoryId: memoryIdSchema }).strict(),
  async run(ctx, args) {
    const input = args as { memoryId: string }
    const verdict = memoryIdMembership(ctx, input.memoryId)
    if (verdict !== null)
      return { result: { ok: false, rejected: true, reason: verdict } }
    const [memory] = await loadBatchMemories(ctx.env, ctx.ownerId, [input.memoryId], ctx.includeContent)
    if (memory === undefined)
      return { result: { ok: false, reason: 'That memory is no longer available.' } }
    return {
      result: {
        memory: {
          id: memory.id,
          title: memory.title,
          kind: memory.kind,
          tags: memory.tags,
          project: memory.project,
          ...(memory.content === undefined ? {} : { content: memory.content }),
          categories: (ctx.snapshot.memberships.get(memory.id) ?? []).map(row => row.category_id),
        },
      },
    }
  },
}

const memorySearchTool: ToolDefinition = {
  name: 'memory_search',
  description:
    'Search the account\'s memories by keyword to check whether a near-duplicate category already exists. Keyword only: semantic search is unavailable inside a maintenance run.',
  effect: 'read',
  optional: true,
  schema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).optional() }).strict(),
  async run(ctx, args) {
    const input = args as { query: string, limit?: number }
    // Reuses the service's own tokeniser, which adds CJK unigrams and bigrams
    // that SQLite's unicode61 tokeniser would otherwise miss.
    const query = ftsQuery(input.query)
    if (query.length === 0)
      return { result: { memories: [] } }
    const rows = await ctx.env.DB.prepare(
      `SELECT m.id, m.title, m.kind, m.project
       FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
       WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.deleted = 0
       ORDER BY bm25(memories_fts) LIMIT ?`,
    )
      .bind(query, ctx.ownerId, input.limit ?? 10)
      .all<{ id: string, title: string, kind: string, project: string }>()
    return { result: { memories: rows.results } }
  },
}

function memoryIdMembership(ctx: ToolContext, memoryId: string): string | null {
  if (!ctx.batchMemoryIds.has(memoryId))
    return 'That memory is not part of the current batch.'
  return null
}

const DEFINITIONS: ToolDefinition[] = [
  catalogOverviewTool,
  catalogListTool,
  catalogMembersTool,
  batchListTool,
  memoryLookupTool,
  memorySearchTool,
  assignTool,
  confirmMembershipsTool,
  unassignTool,
  skipTool,
  proposeCategoryTool,
  proposeMergeTool,
  proposeRetireTool,
  proposeProjectMoveTool,
  finishTool,
]

const BY_NAME = new Map(DEFINITIONS.map(definition => [definition.name, definition]))

/** JSON Schema for every offered tool, derived from the validating schema. */
export function toolsFor(options: { includeSearch: boolean }): ToolSpec[] {
  const classificationTools = new Set([
    'assign',
    'confirm_memberships',
    'unassign',
    'skip',
    'propose_category',
    'propose_merge',
    'propose_retire',
    'propose_project_move',
    'finish',
  ])
  return DEFINITIONS.filter(
    definition => classificationTools.has(definition.name)
      || (options.includeSearch && definition.name === 'memory_search'),
  ).map(definition => ({
    name: definition.name,
    description: definition.description,
    parameters: toolSchema(definition.schema),
  }))
}

function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  // `$schema` is noise for a model, and some gateways reject unknown keys.
  delete json.$schema
  return json
}

export const toolNames = DEFINITIONS.map(definition => definition.name)

/**
 * Validates and runs one tool call. An unknown tool or invalid arguments are
 * recorded and returned to the model as a rejection, so a malformed call is
 * steered rather than fatal.
 */
export async function executeTool(
  ctx: ToolContext,
  name: string,
  rawArguments: unknown,
): Promise<ToolOutcome> {
  const definition = BY_NAME.get(name)
  if (definition === undefined) {
    return rejected(name, 'read', `There is no tool named "${name}". Available tools: ${toolNames.join(', ')}.`)
  }
  const parsed = definition.schema.safeParse(rawArguments)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ')
    return rejected(definition.name, definition.effect, `The arguments were not valid (${issues}).`)
  }
  try {
    return await definition.run(ctx, parsed.data as never)
  }
  catch (error) {
    if (error instanceof AppError)
      throw error
    // A tool that fails unexpectedly must not take the run down with it; the
    // model is told what happened and can choose another approach.
    return rejected(
      definition.name,
      definition.effect,
      `The tool failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
    )
  }
}

export type { BatchMemory }
