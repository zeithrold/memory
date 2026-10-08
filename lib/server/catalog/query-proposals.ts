import type { Principal } from '../../contracts'
import type { Env } from '../env'
import { AppError } from '../errors'
import {
  loadState,
} from './model'
import { decideProposal } from './query-decisions'

export type ProposalView = {
  id: string
  kind: string
  status: string
  evidenceRuns: number
  categoryId: string | null
  targetCategoryId: string | null
  memoryId: string | null
  targetProject: string | null
  lastRunId: string
  rationale: string | null
  payload: unknown
  createdAt: string
}

export async function listProposals(
  env: Env,
  ownerId: string,
  status = 'pending',
): Promise<ProposalView[]> {
  const rows = await env.DB.prepare(
    `SELECT id, kind, status, evidence_runs, category_id, target_category_id, memory_id, target_project,
            last_run_id, rationale, payload_json, created_at
     FROM catalog_proposals WHERE owner_id = ? AND status = ? ORDER BY created_at DESC
LIMIT 100`,
  )
    .bind(
      ownerId,
      status,
    )
    .all<{
    id: string
    kind: string
    status: string
    evidence_runs: number
    category_id: string | null
    target_category_id: string | null
    memory_id: string | null
    target_project: string | null
    last_run_id: string
    rationale: string | null
    payload_json: string
    created_at: string
  }>()
  return rows.results.map(row => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    evidenceRuns: row.evidence_runs,
    categoryId: row.category_id,
    targetCategoryId: row.target_category_id,
    memoryId: row.memory_id,
    targetProject: row.target_project,
    lastRunId: row.last_run_id,
    rationale: row.rationale,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at,
  }))
}

const APPROVE_ORDER: readonly string[] = [
  'create_category',
  'project_move',
  'merge_category',
  'retire_category',
]

export async function appendPendingAdvice(
  env: Env,
  ownerId: string,
  advice: string,
): Promise<void> {
  const trimmed = advice.trim()
  if (trimmed.length === 0) {
    return
  }
  const state = await loadState(env, ownerId)
  const existing = state?.pending_advice?.trim() ?? ''
  const next = existing.length === 0 ? trimmed : `${existing}\n\n${trimmed}`
  await env.DB.prepare(
    `INSERT INTO catalog_state(owner_id, version, pending_advice)
     VALUES (?, 1, ?)
     ON CONFLICT(owner_id) DO UPDATE SET pending_advice = excluded.pending_advice`,
  )
    .bind(ownerId, next)
    .run()
}

export type BulkDecisionResult = {
  decided: number
  failed: { id: string, code: string, detail: string }[]
}

/**
 * Decides many pending proposals in one request. Approve runs create → move →
 * merge → retire so a package that both creates and folds stays coherent.
 */
type DecideProposalsOptions = {
  ownerId: string
  approve: boolean
  ids: string[] | undefined
  advice?: string | null
}

export async function decideProposals(
  env: Env,
  principal: Principal,
  options: DecideProposalsOptions,
): Promise<BulkDecisionResult> {
  const { ownerId, approve, ids, advice } = options

  const pending = await listProposals(env, ownerId, 'pending')
  const ordered = orderSelectedProposals(pending, approve, ids)

  const failed: BulkDecisionResult['failed'] = []
  let decided = 0
  for (const proposal of ordered) {
    try {
      // Advice is stored once after the whole batch, not per proposal.
      await decideProposal(
        env,
        principal,
        { ownerId, proposalId: proposal.id, approve, advice: null },
      )
      decided += 1
    }
    catch (error) {
      if (error instanceof AppError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
        failed.push({ id: proposal.id, code: error.code, detail: error.message })
        continue
      }
      throw error
    }
  }
  if (!approve && advice !== undefined && advice !== null && decided > 0) {
    await appendPendingAdvice(env, ownerId, advice)
  }
  return { decided, failed }
}

function proposalOrder(left: ProposalView, right: ProposalView): number {
  const order = APPROVE_ORDER.indexOf(left.kind) - APPROVE_ORDER.indexOf(right.kind)
  return order === 0 ? left.createdAt.localeCompare(right.createdAt) : order
}

function orderSelectedProposals(
  pending: ProposalView[],
  approve: boolean,
  ids: string[] | undefined,
): ProposalView[] {
  const selected = ids === undefined || ids.length === 0
    ? pending
    : pending.filter(proposal => ids.includes(proposal.id))
  const ordered = approve
    ? [
        ...selected,
      ].sort(proposalOrder)
    : selected

  return ordered
}
