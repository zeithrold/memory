import type { BatchMemory, CatalogSnapshot, MembershipRow } from './model'

/**
 * The gateway every tool call passes through before it can have an effect.
 *
 * The agent is deliberately free to decide *what* to do; this module decides
 * what is allowed to happen. Two rules drive the design:
 *
 * 1. Structural edits are backlogged, never applied inline. Letting an LLM
 *    apply them per turn is measured to explode the taxonomy: removing the
 *    arbitration stage in EvoTaxo took node count from 25 to 70 while every
 *    coherence metric got worse (arXiv:2603.19711). So `assign`/`unassign`
 *    apply immediately — per-memory and reversible — while create/merge/retire
 *    only accumulate evidence for a later consolidation pass. The account's
 *    `auto_apply_structural` flag changes only whether a human must approve a
 *    proposal before that pass applies it.
 * 2. A rejection is information, not silence. The reason is returned to the
 *    model as the tool result so it can adapt, which is the advantage of a tool
 *    loop over a single validated response. Rejections also consume budget.
 */
export const MAX_ROOTS = 8
export const MAX_CHILDREN = 6
export const MAX_CATEGORIES = 64
/** Below this, a re-classification is not worth the churn. */
export const MIN_CONFIDENCE_FOR_REASSIGNMENT = 0.6
/** A settled classification is left alone unless the memory itself changed. */
export const REASSIGNMENT_AGE_DAYS = 7
export const MAX_REASSIGNMENTS_PER_BATCH = 10
export const REASSIGNMENT_CHURN_RATIO = 0.25
/** A category this small is proposed for a merge rather than deleted. */
export const MIN_MEMBERS_TO_KEEP = 2
export const MAX_REASON_LENGTH = 500
/** Structural proposals need this many runs of evidence before arbitration. */
export const MIN_EVIDENCE_RUNS = 2

export type PolicyVerdict = { allowed: true } | { allowed: false, reason: string }

const ALLOWED: PolicyVerdict = { allowed: true }

export interface PolicyInput {
  snapshot: CatalogSnapshot
  /** The agent's workspace: nothing outside the batch is addressable. */
  batchMemoryIds: Set<string>
  /** How many re-classifications this batch has already applied. */
  reassignments: number
  /** Batch size, which bounds the churn allowance. */
  batchSize: number
  memoryId?: string
  categoryId?: string
  targetCategoryId?: string
  primary?: boolean
  confidence?: number
}

export function memoryInBatch(input: PolicyInput, memoryId: string | undefined): PolicyVerdict {
  if (memoryId === undefined || memoryId.length === 0)
    return { allowed: false, reason: 'A memory identifier is required.' }
  // The owner always comes from the run, never from the model, and the batch is
  // the only region of the library the agent may touch.
  if (!input.batchMemoryIds.has(memoryId))
    return { allowed: false, reason: 'That memory is not part of the current batch.' }
  return ALLOWED
}

export function categoryById(input: PolicyInput, categoryId: string | undefined) {
  if (categoryId === undefined || categoryId.length === 0)
    return undefined
  return input.snapshot.categories.find(category => category.id === categoryId)
}

export function membershipOf(
  input: PolicyInput,
  memoryId: string,
  categoryId: string,
): MembershipRow | undefined {
  return (input.snapshot.memberships.get(memoryId) ?? [])
    .find(row => row.category_id === categoryId)
}

function memoryRow(input: PolicyInput, memoryId: string | undefined): BatchMemory | undefined {
  return input.snapshot.memories.find(row => row.id === memoryId)
}

/** Budget for changing an existing classification. */
export function reassignmentBudget(input: PolicyInput): number {
  return Math.min(
    MAX_REASSIGNMENTS_PER_BATCH,
    Math.max(1, Math.floor(input.batchSize * REASSIGNMENT_CHURN_RATIO)),
  )
}

export function canReassign(input: PolicyInput): PolicyVerdict {
  const budget = reassignmentBudget(input)
  if (input.reassignments >= budget) {
    return {
      allowed: false,
      reason: `This batch has already re-classified ${input.reassignments} memories, which is its budget of ${budget}. Finish the batch instead.`,
    }
  }
  if (input.confidence === undefined || input.confidence < MIN_CONFIDENCE_FOR_REASSIGNMENT) {
    return {
      allowed: false,
      reason: `Moving an already classified memory needs a confidence of at least ${MIN_CONFIDENCE_FOR_REASSIGNMENT}.`,
    }
  }
  return ALLOWED
}

/**
 * A memory keeps its classification unless the memory changed or the decision
 * is old enough to deserve revisiting. Without this hysteresis, repeated runs
 * oscillate between two plausible categories.
 */
export function hysteresis(
  assignment: MembershipRow,
  memory: BatchMemory | undefined,
): PolicyVerdict {
  const assignedAt = Date.parse(assignment.updated_at)
  if (memory !== undefined && Date.parse(memory.updated_at) > assignedAt)
    return ALLOWED
  const ageDays = (Date.now() - assignedAt) / 86_400_000
  if (ageDays >= REASSIGNMENT_AGE_DAYS)
    return ALLOWED
  return {
    allowed: false,
    reason: `This memory was classified ${Math.max(0, Math.floor(ageDays))} day(s) ago and has not changed since. Leave it where it is unless new information supports the move.`,
  }
}

export function categoryCapacity(input: PolicyInput, parentId: string | null): PolicyVerdict {
  const categories = input.snapshot.categories
  if (categories.length >= MAX_CATEGORIES) {
    return {
      allowed: false,
      reason: `The catalog already holds its maximum of ${MAX_CATEGORIES} categories. Reuse a category or propose a merge.`,
    }
  }
  const siblings = categories.filter(category => category.parent_id === parentId)
  if (parentId === null && siblings.length >= MAX_ROOTS) {
    return {
      allowed: false,
      reason: `The master catalog already has its maximum of ${MAX_ROOTS} top-level categories. Classify within an existing one.`,
    }
  }
  if (parentId !== null && siblings.length >= MAX_CHILDREN) {
    return {
      allowed: false,
      reason: `That parent already has its maximum of ${MAX_CHILDREN} child categories. Classify within an existing one.`,
    }
  }
  return ALLOWED
}

/** `assign` — may apply immediately. */
export function checkAssign(input: PolicyInput): PolicyVerdict & { reassigns?: MembershipRow } {
  const memory = memoryInBatch(input, input.memoryId)
  if (!memory.allowed)
    return memory
  const category = categoryById(input, input.categoryId)
  if (category === undefined) {
    return {
      allowed: false,
      reason: 'No such category. Call catalog_list for an existing id, or propose_category first.',
    }
  }
  if (category.state !== 'active')
    return { allowed: false, reason: `Category "${category.label}" is not active.` }

  const assignments = input.snapshot.memberships.get(input.memoryId ?? '') ?? []
  const existing = assignments.find(row => row.category_id === input.categoryId)
  const wantsPrimary = input.primary === true
  if (existing !== undefined && (existing.is_primary === 1) === wantsPrimary) {
    return {
      allowed: false,
      reason: 'This memory already has exactly that membership, so nothing would change.',
    }
  }
  // Adding a second, non-primary membership is additive and reversible: it
  // costs no churn budget, which is what makes cross-cutting memories work.
  if (!wantsPrimary && existing === undefined)
    return ALLOWED

  const currentPrimary = assignments.find(row => row.is_primary === 1)
  if (currentPrimary === undefined || currentPrimary.category_id === input.categoryId)
    return ALLOWED

  const age = hysteresis(currentPrimary, memoryRow(input, input.memoryId))
  if (!age.allowed)
    return age
  const budget = canReassign(input)
  if (!budget.allowed)
    return budget
  return { allowed: true, reassigns: currentPrimary }
}

/** `unassign` — may apply immediately, but only for a membership that exists. */
export function checkUnassign(input: PolicyInput): PolicyVerdict {
  const memory = memoryInBatch(input, input.memoryId)
  if (!memory.allowed)
    return memory
  if (membershipOf(input, input.memoryId ?? '', input.categoryId ?? '') === undefined) {
    return {
      allowed: false,
      reason: 'This memory is not in that category, so there is nothing to remove.',
    }
  }
  return ALLOWED
}

/** `skip` — records that a memory was deliberately left unclassified. */
export function checkSkip(input: PolicyInput): PolicyVerdict {
  return memoryInBatch(input, input.memoryId)
}

/** `propose_project_move` — a proposal by construction; the user approves it. */
export function checkProjectMove(input: PolicyInput): PolicyVerdict {
  return memoryInBatch(input, input.memoryId)
}

export function checkProposeCategory(input: PolicyInput, parentId: string | null): PolicyVerdict {
  if (parentId !== null && categoryById(input, parentId) === undefined)
    return { allowed: false, reason: 'The parent category does not exist. Call catalog_list first.' }
  return categoryCapacity(input, parentId)
}

export function checkMerge(input: PolicyInput): PolicyVerdict {
  if (categoryById(input, input.categoryId) === undefined)
    return { allowed: false, reason: 'The category to merge does not exist.' }
  if (categoryById(input, input.targetCategoryId) === undefined)
    return { allowed: false, reason: 'The destination category does not exist.' }
  if (input.categoryId === input.targetCategoryId)
    return { allowed: false, reason: 'A category cannot be merged into itself.' }
  return ALLOWED
}

export function checkRetire(input: PolicyInput): PolicyVerdict {
  const category = categoryById(input, input.categoryId)
  if (category === undefined)
    return { allowed: false, reason: 'That category does not exist, or is already retired.' }
  if (category.depth === 1) {
    const children = input.snapshot.categories.filter(child => child.parent_id === category.id)
    if (children.length > 0) {
      return {
        allowed: false,
        reason: 'Merge or retire this category\'s children first, so no memory is orphaned.',
      }
    }
  }
  return ALLOWED
}

/** Whether a human must approve a structural proposal before it is applied. */
export function proposalNeedsApproval(autoApplyStructural: boolean): boolean {
  return !autoApplyStructural
}
