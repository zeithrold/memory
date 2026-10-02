import type { Env } from '../env'
import type { CategoryRow } from './model'
import type { ActionRecord } from './tools'
import { z } from 'zod'
import {
  clearImplicitSkips,
  loadCategories,
  refreshCatalogCounts,
} from './model'
import { MIN_EVIDENCE_RUNS, MIN_MEMBERS_TO_KEEP, proposalNeedsApproval } from './policy'
import { isoNow } from './run-common'
import { loadSettingsRow } from './settings'

const categoryProposalSchema = z.looseObject({
  parentId: z.union([
    z.null(),
    z.string(),
  ]),
  slug: z.string(),
  label: z.string(),
  description: z.string(),
  boundary: z.string(),
  axisHint: z.union([
    z.null(),
    z.string(),
  ]),
})

export interface ConsolidateResult {
  applied: number
  queued: number
  superseded: number
  pruned: number
}

/**
 * The arbitration pass.
 *
 * Structural edits reach the catalog only here, and only with evidence from
 * more than one run. Applying them per turn is the measured failure mode:
 * removing this stage took a taxonomy from 25 to 70 nodes while every coherence
 * metric got worse (arXiv:2603.19711). When an account has not opted into
 * automatic application, a proposal that has enough evidence is left pending
 * for a human to approve.
 */

interface ApplyStructuralProposalsContext {
  proposals: D1Result<{
    id: string
    kind: string
    category_id: string | null
    target_category_id: string | null
    memory_id: string | null
    target_project: string | null
    payload_json: string
    rationale: string | null
    evidence_runs: number
  }>
  categories: CategoryRow[]
  env: Env
  counters: ConsolidateResult
  needsApproval: boolean
  ownerId: string
  runId: string
}

interface ApplyStructuralProposalContext extends ApplyStructuralProposalsContext {
  proposal: ApplyStructuralProposalsContext['proposals']['results'][number]
}
async function applyStructuralProposal(
  context: ApplyStructuralProposalContext,
): Promise<void> {
  const { proposal, categories, env, counters, needsApproval, ownerId, runId } = context

  if (proposal.kind === 'create_category') {
    const payload = categoryProposalSchema.parse(JSON.parse(proposal.payload_json))
    const exists = categories.some(
      category => category.parent_id === payload.parentId && category.slug === payload.slug,
    )
    if (exists) {
      await env.DB.prepare(
        'UPDATE catalog_proposals SET status = \'superseded\', resolved_at = ? WHERE id = ?',
      )
        .bind(isoNow(), proposal.id)
        .run()
      counters.superseded += 1
      return
    }
    if (proposal.evidence_runs < MIN_EVIDENCE_RUNS) {
      counters.queued += 1
      return
    }
    if (needsApproval) {
      counters.queued += 1
      return
    }
    const id = await createStructuralCategory(env, ownerId, payload)
    await env.DB.prepare(
      'UPDATE catalog_proposals SET status = \'approved\', resolved_at = ? WHERE id = ?',
    )
      .bind(isoNow(), proposal.id)
      .run()
    await recordStructuralAction(
      env,
      ownerId,
      { runId, kind: 'create_category', decision: 'applied', detail: {
        categoryId: id,
        rationale: proposal.rationale ?? undefined,
        after: payload,
      } },
    )
    counters.applied += 1
    return
  }
  // Merge, retire and project-move proposals always wait for a human: each can
  // change what a project-restricted token can see, or remove a category.
  counters.queued += 1
}
async function applyStructuralProposals(
  context: ApplyStructuralProposalsContext,
): Promise<void> {
  const { proposals } = context
  for (const proposal of proposals.results) {
    await applyStructuralProposal({ ...context, proposal })
  }
}

interface ProposeUndersizedMergesContext {
  categories: CategoryRow[]
  env: Env
  ownerId: string
  runId: string
  counters: ConsolidateResult
}

interface ProposeUndersizedMergeContext extends ProposeUndersizedMergesContext {
  category: CategoryRow
}
async function proposeUndersizedMerge(
  context: ProposeUndersizedMergeContext,
): Promise<void> {
  const { category, env, ownerId, runId, counters } = context

  if (category.member_count > MIN_MEMBERS_TO_KEEP || category.parent_id === null) {
    return
  }
  const existing = await env.DB.prepare(
    ('SELECT id FROM catalog_proposals WHERE owner_id = ? AND kind = '
      + '\'merge_category\' AND category_id = ? AND status = \'pending\''),
  )
    .bind(ownerId, category.id)
    .first<{ id: string }>()
  if (existing !== null) {
    return
  }
  const proposalId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id,
target_category_id, payload_json, rationale, evidence_runs, status, created_at)
       VALUES (?, ?, ?, ?, 'merge_category', ?, ?, ?, ?, 1, 'pending', ?)`,
  )
    .bind(
      proposalId,
      ownerId,
      runId,
      runId,
      category.id,
      category.parent_id,
      JSON.stringify({ fromId: category.id, intoId: category.parent_id }),
      `"${category.label}" holds ${category.member_count} memories, below the threshold of ${MIN_MEMBERS_TO_KEEP}.`,
      isoNow(),
    )
    .run()
  await env.DB.prepare(
    `INSERT OR IGNORE INTO catalog_proposal_evidence(proposal_id, run_id, created_at)
       VALUES (?, ?, ?)`,
  )
    .bind(proposalId, runId, isoNow())
    .run()
  await recordStructuralAction(
    env,
    ownerId,
    { runId, kind: 'merge_category', decision: 'proposed', detail: {
      categoryId: category.id,
      targetCategoryId: category.parent_id,
      rationale: `Only ${category.member_count} memories; propose folding into the parent.`,
    } },
  )
  counters.pruned += 1
}
async function proposeUndersizedMerges(
  context: ProposeUndersizedMergesContext,
): Promise<void> {
  const { categories } = context
  for (const category of categories) {
    await proposeUndersizedMerge({ ...context, category })
  }
}
export async function consolidate(
  env: Env,
  ownerId: string,
  runId: string,
): Promise<ConsolidateResult> {
  const settings = await loadSettingsRow(env, ownerId)
  const autoApply = settings?.auto_apply_structural === 1
  const needsApproval = proposalNeedsApproval(autoApply)
  const proposals = await env.DB.prepare(
    `SELECT id, kind, category_id, target_category_id, memory_id, target_project, payload_json,
rationale, evidence_runs
     FROM catalog_proposals WHERE owner_id = ? AND status = 'pending' ORDER BY created_at`,
  )
    .bind(ownerId)
    .all<{
    id: string
    kind: string
    category_id: string | null
    target_category_id: string | null
    memory_id: string | null
    target_project: string | null
    payload_json: string
    rationale: string | null
    evidence_runs: number
  }>()

  const categories = await loadCategories(env, ownerId)
  const counters: ConsolidateResult = { applied: 0, queued: 0, superseded: 0, pruned: 0 }

  await applyStructuralProposals(
    { proposals, categories, env, counters, needsApproval, ownerId, runId },
  )

  // A category that never attracted members is proposed for a merge into its
  // parent rather than deleted, so nothing is lost.
  await proposeUndersizedMerges({ categories, env, ownerId, runId, counters })

  if (counters.applied > 0) {
    await clearImplicitSkips(env, ownerId)
    await refreshCatalogCounts(env, ownerId)
  }

  return counters
}

interface RecordStructuralActionOptions {
  runId: string
  kind: string
  decision: 'applied' | 'proposed'
  detail: Partial<ActionRecord>
}

async function recordStructuralAction(
  env: Env,
  ownerId: string,
  options: RecordStructuralActionOptions,
): Promise<void> {
  const { runId, kind, decision, detail } = options

  const seq = await env.DB.prepare(
    'SELECT COALESCE(max(call_index), 0) + 1 AS next FROM catalog_actions WHERE run_id = ? AND batch = -1',
  )
    .bind(
      runId,
    )
    .first<{ next: number }>()
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, target_category_id, target_project, arguments_json, rationale,
decision, created_at)
     VALUES (?, ?, -1, 0, ?, ?, ?, 'proposal', ?, ?, ?, ?, '{}', ?, ?, ?)
     ON CONFLICT(run_id, batch, turn, call_index) DO NOTHING`,
  )
    .bind(
      runId,
      ownerId,
      seq?.next ?? 1,
      kind,
      kind,
      detail.memoryId ?? null,
      detail.categoryId ?? null,
      detail.targetCategoryId ?? null,
      detail.targetProject ?? null,
      detail.rationale ?? null,
      decision,
      isoNow(),
    )
    .run()
}

async function createStructuralCategory(
  env: Env,
  ownerId: string,
  payload: z.output<typeof categoryProposalSchema>,
): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, axis_hint,
depth, member_count, state, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', 'agent', ?, ?)`,
  )
    .bind(

      id,

      ownerId,

      payload.parentId,

      payload.slug,

      payload.label,

      payload.description,

      payload.boundary,

      payload.axisHint,

      payload.parentId === null ? 1 : 2,

      isoNow(),

      isoNow(),
    )
    .run()

  return id
}
