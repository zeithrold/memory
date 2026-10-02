import type { Principal } from '../../contracts'
import type { Env } from '../env'
import type { ProposalView } from './query-proposals'
import type { ActionRecord } from './tools'
import { z } from 'zod'
import { AppError } from '../errors'
import { moveMemoryProject } from '../memories'
import {
  clearImplicitSkips,
  refreshCatalogCounts,
} from './model'
import { approveCategory, approveMerge, recordHumanDecision } from './query-approvals'
import { isoNow } from './query-common'
import { appendPendingAdvice, listProposals } from './query-proposals'

interface DecisionEffects { catalogChanged: boolean, categoryCreated: boolean, mergeDecided: boolean }

interface DecisionProposalRow {

  id: string
  kind: string
  status: string
  memory_id: string | null
  category_id: string | null
  target_category_id: string | null
  target_project: string | null
  payload_json: string
  rationale: string | null
  evidence_runs: number
  first_run_id: string
  last_run_id: string
  created_at: string

}

/**
 * Applies or rejects a proposal. A project move is the only place the service
 * changes a memory's project, and it happens here because a human asked for it:
 * the agent itself can only ever propose one.
 */

interface ApplyApprovedProposalContext {
  approve: boolean
  proposal: DecisionProposalRow
  env: Env
  ownerId: string
  principal: Principal
  counters: DecisionEffects
  action: ActionRecord
}
async function applyApprovedProposal(
  context: ApplyApprovedProposalContext,
): Promise<void> {
  const { approve, proposal, env, ownerId, principal, counters, action } = context
  if (approve) {
    if (proposal.kind === 'project_move') {
      const payload = z.looseObject({ memoryId: z.string(), to: z.string() }).parse(
        JSON.parse(proposal.payload_json),
      )
      const row = await env.DB.prepare(
        'SELECT version FROM memories WHERE id = ? AND owner_id = ? AND deleted = 0',
      )
        .bind(payload.memoryId, ownerId)
        .first<{ version: number }>()
      if (row === null) {
        throw new AppError('NOT_FOUND', 'The memory to move no longer exists.')
      }
      await moveMemoryProject(
        env,
        principal,
        { id: payload.memoryId, expectedVersion: row.version, targetProject: payload.to },
      )
    }
    else if (proposal.kind === 'create_category') {
      await approveCategory(env, ownerId, proposal.id, proposal.payload_json)
      counters.catalogChanged = true
      counters.categoryCreated = true
    }
    else if (proposal.kind === 'merge_category') {
      if (proposal.category_id === null || proposal.target_category_id === null) {
        throw new AppError('CONFLICT', 'That proposal is missing its categories.')
      }
      await approveMerge(
        env,
        ownerId,
        {
          proposalId: proposal.id,
          runId: proposal.last_run_id,
          action,
          fromId: proposal.category_id,
          intoId: proposal.target_category_id,
        },
      )
      counters.mergeDecided = true
    }
    else if (proposal.kind === 'retire_category') {
      await env.DB.prepare(
        'UPDATE categories SET state = \'retired\', updated_at = ? WHERE id = ? AND owner_id = ?',
      )
        .bind(

          isoNow(),

          proposal.category_id,

          ownerId,
        )
        .run()
      counters.catalogChanged = true
    }
  }
}

interface FinalizeProposalDecisionContext {
  counters: DecisionEffects
  env: Env
  approve: boolean
  proposalId: string
  advice: string | null | undefined
  ownerId: string
  proposal: DecisionProposalRow
  action: ActionRecord
}
async function finalizeProposalDecision(
  context: FinalizeProposalDecisionContext,
): Promise<void> {
  const { counters, env, approve, proposalId, advice, ownerId, proposal, action } = context
  if (!counters.mergeDecided) {
    await env.DB.prepare(
      'UPDATE catalog_proposals SET status = ?, resolved_at = ? WHERE id = ?',
    )
      .bind(approve ? 'approved' : 'rejected', isoNow(), proposalId)
      .run()
    if (!approve && advice !== undefined && advice !== null) {
      await appendPendingAdvice(env, ownerId, advice)
    }
    if (counters.categoryCreated) {
      await clearImplicitSkips(env, ownerId)
    }
    if (counters.catalogChanged) {
      await refreshCatalogCounts(env, ownerId)
    }
    // The decision is filed against the run that raised the proposal, because a
    // catalog action belongs to a run: the column references one.
    await recordHumanDecision(env, ownerId, proposal.last_run_id, action)
  }
}
interface DecideProposalOptions { ownerId: string, proposalId: string, approve: boolean, advice?: string | null }

export async function decideProposal(
  env: Env,
  principal: Principal,
  options: DecideProposalOptions,
): Promise<ProposalView> {
  const { ownerId, proposalId, approve, advice } = options

  const proposal = await env.DB.prepare(
    'SELECT * FROM catalog_proposals WHERE id = ? AND owner_id = ?',
  )
    .bind(proposalId, ownerId)
    .first<DecisionProposalRow>()
  if (proposal === null) {
    throw new AppError('NOT_FOUND', 'That proposal does not exist.')
  }
  if (proposal.status !== 'pending') {
    throw new AppError('CONFLICT', 'That proposal has already been decided.')
  }

  const action = proposalDecisionAction(proposal, approve)
  const counters: DecisionEffects = { catalogChanged: false, categoryCreated: false, mergeDecided: false }

  await applyApprovedProposal({ approve, proposal, env, ownerId, principal, counters, action })

  await finalizeProposalDecision(
    { counters, env, approve, proposalId, advice, ownerId, proposal, action },
  )
  const [view] = await listProposals(env, ownerId, approve ? 'approved' : 'rejected')
  const refreshed = view?.id === proposalId
    ? view
    : (await listProposals(env, ownerId, approve ? 'approved' : 'rejected'))
        .find(entry => entry.id === proposalId)
  if (refreshed === undefined) {
    throw new AppError('INTERNAL_ERROR', 'The proposal could not be re-read after the decision.')
  }
  return refreshed
}

function proposalDecisionAction(
  proposal: DecisionProposalRow,
  approve: boolean,
): ActionRecord {
  return {
    kind: proposal.kind,
    effect: 'proposal',
    decision: approve ? 'applied' : 'rejected_by_user',
    memoryId: proposal.memory_id ?? undefined,
    categoryId: proposal.category_id ?? undefined,
    targetCategoryId: proposal.target_category_id ?? undefined,
    targetProject: proposal.target_project ?? undefined,
    rationale: proposal.rationale ?? undefined,
  }
}
