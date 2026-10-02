import type { ActionRecord, ToolContext, ToolOutcome } from './tool-common'
import { z } from 'zod'
import { now } from './tool-common'

/**
 * Structural tools share one path: they always backlog a proposal, and never
 * touch `categories` or `memory_categories`. Equivalent proposals accumulate
 * evidence across runs instead of piling up as duplicates.
 */
interface RecordProposalProposal {
  kind: 'create_category' | 'merge_category' | 'retire_category' | 'project_move'
  categoryId?: string
  targetCategoryId?: string
  memoryId?: string
  targetProject?: string
  payload: Record<string, unknown>
  rationale: string
}

export async function recordProposal(
  ctx: ToolContext,
  proposal: RecordProposalProposal,
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
    return await supportExistingProposal(ctx, proposal, existing, action)
  }
  return await createProposal(ctx, proposal, action, timestamp)
}

interface StructuralProposal extends ProposalCandidate { rationale: string }
async function supportExistingProposal(
  ctx: ToolContext,
  proposal: StructuralProposal,
  existing: { id: string, evidence_runs: number },
  action: ActionRecord,
): Promise<ToolOutcome> {
  const inserted = await recordProposalEvidence(ctx, existing.id)
  if (inserted) {
    await ctx.env.DB.prepare(
      `UPDATE catalog_proposals
         SET evidence_runs = (SELECT count(*) FROM catalog_proposal_evidence WHERE proposal_id
= ?),
             last_run_id = ?, payload_json = ?, rationale = ?
         WHERE id = ?`,
    )
      .bind(
        existing.id,
        ctx.runId,
        JSON.stringify(proposal.payload),
        proposal.rationale,
        existing.id,
      )
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
async function createProposal(
  ctx: ToolContext,
  proposal: StructuralProposal,
  action: ActionRecord,
  timestamp: string,
): Promise<ToolOutcome> {
  const id = crypto.randomUUID()
  await ctx.env.DB.prepare(
    `INSERT INTO catalog_proposals(id, owner_id, first_run_id, last_run_id, kind, category_id,
target_category_id, memory_id, target_project, payload_json, rationale, evidence_runs,
status, created_at)
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
    return await ctx.env.DB.prepare(
      `${base}
       AND COALESCE(json_extract(payload_json, '$.parentId'), '') = COALESCE(?, '')
       AND lower(json_extract(payload_json, '$.slug')) = ?`,
    )
      .bind(
        ctx.ownerId,
        proposal.kind,
        proposal.payload.parentId ?? null,
        z.string().parse(proposal.payload.slug).trim().toLowerCase(),
      )
      .first<{ id: string, evidence_runs: number }>()
  }
  if (proposal.kind === 'merge_category') {
    return await ctx.env.DB.prepare(`${base} AND category_id = ? AND target_category_id = ?`)
      .bind(ctx.ownerId, proposal.kind, proposal.categoryId, proposal.targetCategoryId)
      .first<{ id: string, evidence_runs: number }>()
  }
  if (proposal.kind === 'retire_category') {
    return await ctx.env.DB.prepare(`${base} AND category_id = ?`)
      .bind(ctx.ownerId, proposal.kind, proposal.categoryId)
      .first<{ id: string, evidence_runs: number }>()
  }
  return await ctx.env.DB.prepare(`${base} AND memory_id = ? AND target_project = ?`)
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
  return result.meta.changes > 0
}
