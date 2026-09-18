import type { Principal } from '../../contracts'
import type { Env } from '../env'
import type { ActionRecord } from './tools'
import { AppError } from '../errors'
import { moveMemoryProject } from '../memories'
import {
  clearImplicitSkips,
  loadCategories,
  loadState,
  refreshCatalogCounts,
} from './model'

/**
 * Read models and human-driven mutations: the catalog tree, the run timeline,
 * reverting a run, and deciding a structural proposal.
 *
 * Everything here is reached only through a browser session. An agent token
 * must not be able to approve a project move, because a move changes which
 * project-restricted tokens can see a memory.
 */
function isoNow(): string {
  return new Date().toISOString()
}

export interface CategoryView {
  id: string
  parentId: string | null
  depth: number
  slug: string
  label: string
  description: string
  boundary: string
  axisHint: string | null
  memberCount: number
  state: string
  createdBy: string
  updatedAt: string
}

export interface CatalogView {
  version: number
  updatedAt: string | null
  categories: CategoryView[]
  assigned: number
  orphans: number
  skipped: number
  pendingProposals: number
  pendingAdvice: string | null
}

function serializeCategory(category: {
  id: string
  parent_id: string | null
  depth: number
  slug: string
  label: string
  description: string
  boundary: string
  axis_hint: string | null
  member_count: number
  state: string
  created_by: string
  updated_at: string
}): CategoryView {
  return {
    id: category.id,
    parentId: category.parent_id,
    depth: category.depth,
    slug: category.slug,
    label: category.label,
    description: category.description,
    boundary: category.boundary,
    axisHint: category.axis_hint,
    memberCount: category.member_count,
    state: category.state,
    createdBy: category.created_by,
    updatedAt: category.updated_at,
  }
}

export async function getCatalogView(env: Env, ownerId: string): Promise<CatalogView> {
  const [categories, state, pending] = await Promise.all([
    loadCategories(env, ownerId),
    loadState(env, ownerId),
    env.DB.prepare(
      'SELECT count(*) AS n FROM catalog_proposals WHERE owner_id = ? AND status = \'pending\'',
    )
      .bind(ownerId)
      .first<{ n: number }>(),
  ])
  return {
    version: state?.version ?? 1,
    updatedAt: state?.last_run_at ?? null,
    categories: categories.map(serializeCategory),
    assigned: state?.assigned_count ?? 0,
    orphans: state?.orphan_count ?? 0,
    skipped: state?.skipped_count ?? 0,
    pendingProposals: pending?.n ?? 0,
    pendingAdvice: state?.pending_advice ?? null,
  }
}

const CATEGORY_PAGE_SIZE = 30

export interface CategoryDetailView {
  category: CategoryView
  children: CategoryView[]
  memories: {
    id: string
    title: string
    kind: string
    project: string
    isPrimary: boolean
    updatedAt: string
  }[]
  total: number
  offset: number
}

/** One category with its direct children and a page of directly assigned memories. */
export async function getCategoryDetail(
  env: Env,
  ownerId: string,
  categoryId: string,
  offset: number,
): Promise<CategoryDetailView> {
  const category = await env.DB.prepare(
    'SELECT * FROM categories WHERE id = ? AND owner_id = ? AND state != \'retired\'',
  )
    .bind(categoryId, ownerId)
    .first<{
    id: string
    parent_id: string | null
    depth: number
    slug: string
    label: string
    description: string
    boundary: string
    axis_hint: string | null
    member_count: number
    state: string
    created_by: string
    updated_at: string
  }>()
  if (category === null)
    throw new AppError('NOT_FOUND', 'That category does not exist.')

  const [children, totalRow, memories] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM categories
       WHERE owner_id = ? AND parent_id = ? AND state != 'retired'
       ORDER BY slug`,
    )
      .bind(ownerId, categoryId)
      .all<{
      id: string
      parent_id: string | null
      depth: number
      slug: string
      label: string
      description: string
      boundary: string
      axis_hint: string | null
      member_count: number
      state: string
      created_by: string
      updated_at: string
    }>(),
    env.DB.prepare(
      `SELECT count(*) AS n FROM memory_categories mc
       JOIN memories m ON m.id = mc.memory_id
       WHERE mc.owner_id = ? AND mc.category_id = ? AND m.deleted = 0`,
    )
      .bind(ownerId, categoryId)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT m.id, m.title, m.kind, m.project, mc.is_primary, m.updated_at
       FROM memory_categories mc
       JOIN memories m ON m.id = mc.memory_id
       WHERE mc.owner_id = ? AND mc.category_id = ? AND m.deleted = 0
       ORDER BY mc.is_primary DESC, m.updated_at DESC, m.id
       LIMIT ? OFFSET ?`,
    )
      .bind(ownerId, categoryId, CATEGORY_PAGE_SIZE, offset)
      .all<{
      id: string
      title: string
      kind: string
      project: string
      is_primary: number
      updated_at: string
    }>(),
  ])

  return {
    category: serializeCategory(category),
    children: children.results.map(serializeCategory),
    memories: memories.results.map(row => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      project: row.project,
      isPrimary: row.is_primary === 1,
      updatedAt: row.updated_at,
    })),
    total: totalRow?.n ?? 0,
    offset,
  }
}

export interface RunSummary {
  id: string
  trigger: string
  mode: string
  status: string
  provider: string | null
  model: string | null
  batches: number
  turns: number
  toolCalls: number
  rejected: number
  memoriesSeen: number
  actionsApplied: number
  unorganized: number
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  usageMissingTurns: number
  tokenUsageComplete: boolean
  errorCode: string | null
  startedAt: string
  finishedAt: string | null
}

const RUN_COLUMNS = `id, trigger, mode, status, provider, model, batches, turns, tool_calls, rejected,
  memories_seen, actions_applied, unorganized, prompt_tokens, completion_tokens, usage_missing_turns,
  error_code, started_at, finished_at`

interface RunRow {
  id: string
  trigger: string
  mode: string
  status: string
  provider: string | null
  model: string | null
  batches: number
  turns: number
  tool_calls: number
  rejected: number
  memories_seen: number
  actions_applied: number
  unorganized: number
  prompt_tokens: number | null
  completion_tokens: number | null
  usage_missing_turns: number
  error_code: string | null
  started_at: string
  finished_at: string | null
}

function serializeRun(row: RunRow): RunSummary {
  return {
    id: row.id,
    trigger: row.trigger,
    mode: row.mode,
    status: row.status,
    provider: row.provider,
    model: row.model,
    batches: row.batches,
    turns: row.turns,
    toolCalls: row.tool_calls,
    rejected: row.rejected,
    memoriesSeen: row.memories_seen,
    actionsApplied: row.actions_applied,
    unorganized: row.unorganized,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.prompt_tokens === null && row.completion_tokens === null
      ? null
      : (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0),
    usageMissingTurns: row.usage_missing_turns,
    tokenUsageComplete: row.usage_missing_turns === 0,
    errorCode: row.error_code,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export async function listRuns(
  env: Env,
  ownerId: string,
  limit: number,
  offset = 0,
): Promise<{ runs: RunSummary[], total: number, offset: number, limit: number }> {
  const [rows, totalRow] = await Promise.all([
    env.DB.prepare(
      `SELECT ${RUN_COLUMNS} FROM catalog_runs WHERE owner_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(ownerId, limit, offset)
      .all<RunRow>(),
    env.DB.prepare(
      'SELECT count(*) AS n FROM catalog_runs WHERE owner_id = ?',
    )
      .bind(ownerId)
      .first<{ n: number }>(),
  ])
  return {
    runs: rows.results.map(serializeRun),
    total: totalRow?.n ?? 0,
    offset,
    limit,
  }
}

export interface TimelineEntry {
  batch: number
  turn: number
  content: string | null
  promptTokens: number | null
  completionTokens: number | null
  latencyMs: number | null
  actions: {
    id: number
    tool: string
    kind: string
    effect: string
    decision: string
    policyReason: string | null
    rationale: string | null
    memoryId: string | null
    memoryTitle: string | null
    categoryId: string | null
    categoryLabel: string | null
    targetCategoryId: string | null
    targetCategoryLabel: string | null
    targetProject: string | null
  }[]
}

export interface RunDetail {
  run: RunSummary
  timeline: TimelineEntry[]
  totalActions: number
  offset: number
  limit: number
  operatorPrompt: string | null
}

const ACTION_PAGE_SIZE = 40

/**
 * A page of the run replay, ordered by turn, with memory titles resolved at
 * read time. The audit tables deliberately store identifiers rather than a
 * copy of the memory, so forgetting a memory also removes it from old run
 * timelines.
 */
export async function getRunDetail(
  env: Env,
  ownerId: string,
  runId: string,
  offset = 0,
  limit = ACTION_PAGE_SIZE,
): Promise<RunDetail> {
  const run = await env.DB.prepare(
    `SELECT ${RUN_COLUMNS}, operator_prompt FROM catalog_runs WHERE id = ? AND owner_id = ?`,
  )
    .bind(runId, ownerId)
    .first<RunRow & { operator_prompt: string | null }>()
  if (run === null)
    throw new AppError('RUN_NOT_FOUND', 'No catalog run exists with that identifier.')

  const [totalRow, actionPage] = await Promise.all([
    env.DB.prepare(
      'SELECT count(*) AS n FROM catalog_actions WHERE run_id = ? AND owner_id = ?',
    )
      .bind(runId, ownerId)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT a.id, a.batch, a.turn, a.tool, a.kind, a.effect, a.decision, a.policy_reason, a.rationale,
              a.memory_id, m.title AS memory_title, a.category_id, c.label AS category_label,
              a.target_category_id, tc.label AS target_category_label, a.target_project
       FROM catalog_actions a
       LEFT JOIN memories m ON m.id = a.memory_id
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN categories tc ON tc.id = a.target_category_id
       WHERE a.run_id = ? AND a.owner_id = ?
       ORDER BY a.batch, a.turn, a.call_index
       LIMIT ? OFFSET ?`,
    )
      .bind(runId, ownerId, limit, offset)
      .all<{
      id: number
      batch: number
      turn: number
      tool: string
      kind: string
      effect: string
      decision: string
      policy_reason: string | null
      rationale: string | null
      memory_id: string | null
      memory_title: string | null
      category_id: string | null
      category_label: string | null
      target_category_id: string | null
      target_category_label: string | null
      target_project: string | null
    }>(),
  ])

  const turnKeys = new Set(actionPage.results.map(action => `${action.batch}:${action.turn}`))
  interface TurnMeta {
    batch: number
    turn: number
    content: string | null
    prompt_tokens: number | null
    completion_tokens: number | null
    latency_ms: number | null
  }
  const turnRows = turnKeys.size === 0
    ? { results: [] as TurnMeta[] }
    : await env.DB.prepare(
        `SELECT batch, turn, content, prompt_tokens, completion_tokens, latency_ms
         FROM catalog_turns WHERE run_id = ? AND owner_id = ?
         ORDER BY batch, turn`,
      )
        .bind(runId, ownerId)
        .all<TurnMeta>()

  const timeline = new Map<string, TimelineEntry>()
  for (const turn of turnRows.results) {
    const key = `${turn.batch}:${turn.turn}`
    if (!turnKeys.has(key))
      continue
    timeline.set(key, {
      batch: turn.batch,
      turn: turn.turn,
      content: turn.content,
      promptTokens: turn.prompt_tokens,
      completionTokens: turn.completion_tokens,
      latencyMs: turn.latency_ms,
      actions: [],
    })
  }
  for (const action of actionPage.results) {
    const key = `${action.batch}:${action.turn}`
    let entry = timeline.get(key)
    if (entry === undefined) {
      entry = {
        batch: action.batch,
        turn: action.turn,
        content: null,
        promptTokens: null,
        completionTokens: null,
        latencyMs: null,
        actions: [],
      }
      timeline.set(key, entry)
    }
    entry.actions.push({
      id: action.id,
      tool: action.tool,
      kind: action.kind,
      effect: action.effect,
      decision: action.decision,
      policyReason: action.policy_reason,
      rationale: action.rationale,
      memoryId: action.memory_id,
      memoryTitle: action.memory_title,
      categoryId: action.category_id,
      categoryLabel: action.category_label,
      targetCategoryId: action.target_category_id,
      targetCategoryLabel: action.target_category_label,
      targetProject: action.target_project,
    })
  }
  return {
    run: serializeRun(run),
    timeline: [...timeline.values()].sort((left, right) =>
      left.batch - right.batch || left.turn - right.turn,
    ),
    totalActions: totalRow?.n ?? 0,
    offset,
    limit,
    operatorPrompt: run.operator_prompt,
  }
}

/** Re-classifications this run applied, for the churn metric. */
export async function getMetrics(env: Env, ownerId: string): Promise<unknown> {
  const [daily, totals] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM catalog_metrics_daily WHERE owner_id = ? ORDER BY day DESC LIMIT 90',
    )
      .bind(ownerId)
      .all(),
    env.DB.prepare(
      `SELECT count(*) AS runs, COALESCE(sum(turns), 0) AS turns, COALESCE(sum(tool_calls), 0) AS tool_calls,
              COALESCE(sum(applied), 0) AS applied, COALESCE(sum(rejected), 0) AS rejected,
              COALESCE(sum(reassignments), 0) AS reassignments, COALESCE(sum(unorganized), 0) AS unorganized,
              COALESCE(sum(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(sum(completion_tokens), 0) AS completion_tokens,
              COALESCE(sum(usage_missing_turns), 0) AS usage_missing_turns
       FROM catalog_metrics_daily WHERE owner_id = ?`,
    )
      .bind(ownerId)
      .first(),
  ])
  return { totals, daily: daily.results }
}

/**
 * Undoes the effects a run applied.
 *
 * Only effects that are genuinely reversible are inverted. A category the run
 * created is removed only while it is still empty; anything else is reported
 * back so the user is not told a reversal happened when it did not.
 */
export async function revertRun(
  env: Env,
  ownerId: string,
  runId: string,
): Promise<{ reverted: number, skipped: number }> {
  const run = await env.DB.prepare(
    'SELECT id, status FROM catalog_runs WHERE id = ? AND owner_id = ?',
  )
    .bind(runId, ownerId)
    .first<{ id: string, status: string }>()
  if (run === null)
    throw new AppError('RUN_NOT_FOUND', 'No catalog run exists with that identifier.')
  if (run.status === 'running' || run.status === 'queued') {
    throw new AppError(
      'RUN_IN_PROGRESS',
      'A run that is still in progress cannot be reverted.',
    )
  }
  if (run.status === 'reverted')
    return { reverted: 0, skipped: 0 }

  const applied = await env.DB.prepare(
    `SELECT id, kind, decision, memory_id, category_id, before_json, after_json
     FROM catalog_actions
     WHERE run_id = ? AND owner_id = ? AND decision = 'applied' AND revert_of IS NULL
     ORDER BY id DESC`,
  )
    .bind(runId, ownerId)
    .all<{
    id: number
    kind: string
    decision: string
    memory_id: string | null
    category_id: string | null
    before_json: string | null
    after_json: string | null
  }>()

  let reverted = 0
  let skipped = 0
  const touched = new Set<string>()
  for (const action of applied.results) {
    const inverse = await invert(env, ownerId, action)
    if (inverse === null) {
      skipped += 1
      continue
    }
    if (action.memory_id !== null)
      touched.add(action.memory_id)
    await env.DB.prepare(
      `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, arguments_json, rationale, decision, revert_of, created_at)
       SELECT ?, ?, -2, 0, COALESCE(max(call_index), 0) + 1, ?, 'revert', 'immediate', ?, ?, '{}', ?, 'applied', ?, ?
       FROM catalog_actions WHERE run_id = ? AND batch = -2`,
    )
      .bind(
        runId,
        ownerId,
        action.kind,
        action.memory_id,
        action.category_id,
        `Reverted ${action.kind}.`,
        action.id,
        isoNow(),
        runId,
      )
      .run()
    reverted += 1
  }
  for (const categoryId of touched) {
    await env.DB.prepare(
      'UPDATE categories SET member_count = (SELECT count(*) FROM memory_categories WHERE category_id = categories.id), updated_at = ? WHERE id = ?',
    )
      .bind(isoNow(), categoryId)
      .run()
  }
  await env.DB.prepare('UPDATE catalog_runs SET status = \'reverted\', finished_at = ? WHERE id = ?')
    .bind(isoNow(), runId)
    .run()
  return { reverted, skipped }
}

async function invert(
  env: Env,
  ownerId: string,
  action: { kind: string, memory_id: string | null, category_id: string | null, before_json: string | null, after_json: string | null },
): Promise<unknown | null> {
  if (action.kind === 'assign' && action.memory_id !== null && action.category_id !== null) {
    const before = parseArray(action.before_json)
    const previous = before.find(entry => entry.category_id === action.category_id)
    if (previous === undefined) {
      await env.DB.prepare('DELETE FROM memory_categories WHERE memory_id = ? AND category_id = ?')
        .bind(action.memory_id, action.category_id)
        .run()
    }
    else {
      await env.DB.prepare(
        'UPDATE memory_categories SET is_primary = ?, confidence = ?, updated_at = ? WHERE memory_id = ? AND category_id = ?',
      )
        .bind(previous.is_primary, previous.confidence, isoNow(), action.memory_id, action.category_id)
        .run()
    }
    // Restore the primary flag of whatever this assignment displaced.
    const displaced = before.find(entry => entry.is_primary === 1 && entry.category_id !== action.category_id)
    if (displaced !== undefined) {
      await env.DB.prepare(
        'UPDATE memory_categories SET is_primary = 1, updated_at = ? WHERE memory_id = ? AND category_id = ?',
      )
        .bind(isoNow(), action.memory_id, displaced.category_id)
        .run()
    }
    return true
  }
  if (action.kind === 'unassign' && action.memory_id !== null && action.category_id !== null) {
    const before = parseArray(action.before_json)
    const previous = before.find(entry => entry.category_id === action.category_id)
    if (previous === undefined)
      return null
    await env.DB.prepare(
      `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence, assigned_by, catalog_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'agent', 1, ?, ?)
       ON CONFLICT(memory_id, category_id) DO UPDATE SET is_primary = excluded.is_primary, confidence = excluded.confidence`,
    )
      .bind(ownerId, action.memory_id, action.category_id, previous.is_primary, previous.confidence, isoNow(), isoNow())
      .run()
    return true
  }
  if (action.kind === 'skip' && action.memory_id !== null) {
    await env.DB.prepare('DELETE FROM catalog_skips WHERE memory_id = ?').bind(action.memory_id).run()
    return true
  }
  if (action.kind === 'create_category' && action.category_id !== null) {
    // Only an empty category can be removed without orphaning memories.
    const members = await env.DB.prepare(
      'SELECT count(*) AS n FROM memory_categories WHERE category_id = ?',
    )
      .bind(action.category_id)
      .first<{ n: number }>()
    if ((members?.n ?? 0) > 0)
      return null
    await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner_id = ?')
      .bind(action.category_id, ownerId)
      .run()
    return true
  }
  return null
}

function parseArray(raw: string | null): { category_id: string, is_primary: number, confidence: number }[] {
  if (raw === null)
    return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? (parsed as { category_id: string, is_primary: number, confidence: number }[])
      : []
  }
  catch {
    return []
  }
}

export interface ProposalView {
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
     FROM catalog_proposals WHERE owner_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(ownerId, status)
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

const APPROVE_ORDER = ['create_category', 'project_move', 'merge_category', 'retire_category'] as const

async function appendPendingAdvice(env: Env, ownerId: string, advice: string): Promise<void> {
  const trimmed = advice.trim()
  if (trimmed.length === 0)
    return
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

/**
 * Applies or rejects a proposal. A project move is the only place the service
 * changes a memory's project, and it happens here because a human asked for it:
 * the agent itself can only ever propose one.
 */
export async function decideProposal(
  env: Env,
  principal: Principal,
  ownerId: string,
  proposalId: string,
  approve: boolean,
  advice?: string | null,
): Promise<ProposalView> {
  const proposal = await env.DB.prepare(
    'SELECT * FROM catalog_proposals WHERE id = ? AND owner_id = ?',
  )
    .bind(proposalId, ownerId)
    .first<{
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
  }>()
  if (proposal === null)
    throw new AppError('NOT_FOUND', 'That proposal does not exist.')
  if (proposal.status !== 'pending')
    throw new AppError('CONFLICT', 'That proposal has already been decided.')

  let catalogChanged = false
  let categoryCreated = false
  if (approve) {
    if (proposal.kind === 'project_move') {
      const payload = JSON.parse(proposal.payload_json) as { memoryId: string, to: string }
      const row = await env.DB.prepare(
        'SELECT version FROM memories WHERE id = ? AND owner_id = ? AND deleted = 0',
      )
        .bind(payload.memoryId, ownerId)
        .first<{ version: number }>()
      if (row === null)
        throw new AppError('NOT_FOUND', 'The memory to move no longer exists.')
      await moveMemoryProject(env, principal, payload.memoryId, row.version, payload.to)
    }
    else if (proposal.kind === 'create_category') {
      await approveCategory(env, ownerId, proposal.id, proposal.payload_json)
      catalogChanged = true
      categoryCreated = true
    }
    else if (proposal.kind === 'merge_category') {
      if (proposal.category_id === null || proposal.target_category_id === null)
        throw new AppError('CONFLICT', 'That proposal is missing its categories.')
      await env.DB.prepare(
        'UPDATE memory_categories SET category_id = ?, updated_at = ? WHERE category_id = ? AND owner_id = ?',
      )
        .bind(proposal.target_category_id, isoNow(), proposal.category_id, ownerId)
        .run()
      await env.DB.prepare(
        'UPDATE categories SET state = \'retired\', member_count = 0, updated_at = ? WHERE id = ? AND owner_id = ?',
      )
        .bind(isoNow(), proposal.category_id, ownerId)
        .run()
      await env.DB.prepare(
        'UPDATE categories SET member_count = (SELECT count(*) FROM memory_categories WHERE category_id = categories.id), updated_at = ? WHERE id = ?',
      )
        .bind(isoNow(), proposal.target_category_id)
        .run()
      catalogChanged = true
    }
    else if (proposal.kind === 'retire_category') {
      await env.DB.prepare(
        'UPDATE categories SET state = \'retired\', updated_at = ? WHERE id = ? AND owner_id = ?',
      )
        .bind(isoNow(), proposal.category_id, ownerId)
        .run()
      catalogChanged = true
    }
  }

  await env.DB.prepare(
    'UPDATE catalog_proposals SET status = ?, resolved_at = ? WHERE id = ?',
  )
    .bind(approve ? 'approved' : 'rejected', isoNow(), proposalId)
    .run()
  if (!approve && advice !== undefined && advice !== null)
    await appendPendingAdvice(env, ownerId, advice)
  if (categoryCreated)
    await clearImplicitSkips(env, ownerId)
  if (catalogChanged)
    await refreshCatalogCounts(env, ownerId)
  const action: ActionRecord = {
    kind: proposal.kind,
    effect: 'proposal',
    decision: approve ? 'applied' : 'rejected_by_user',
    memoryId: proposal.memory_id ?? undefined,
    categoryId: proposal.category_id ?? undefined,
    targetCategoryId: proposal.target_category_id ?? undefined,
    targetProject: proposal.target_project ?? undefined,
    rationale: proposal.rationale ?? undefined,
  }
  // The decision is filed against the run that raised the proposal, because a
  // catalog action belongs to a run: the column references one.
  await recordHumanDecision(env, ownerId, proposal.last_run_id, action)
  const [view] = await listProposals(env, ownerId, approve ? 'approved' : 'rejected')
  const refreshed = view?.id === proposalId
    ? view
    : (await listProposals(env, ownerId, approve ? 'approved' : 'rejected'))
        .find(entry => entry.id === proposalId)
  if (refreshed === undefined)
    throw new AppError('INTERNAL_ERROR', 'The proposal could not be re-read after the decision.')
  return refreshed
}

export interface BulkDecisionResult {
  decided: number
  failed: { id: string, code: string, detail: string }[]
}

/**
 * Decides many pending proposals in one request. Approve runs create → move →
 * merge → retire so a package that both creates and folds stays coherent.
 */
export async function decideProposals(
  env: Env,
  principal: Principal,
  ownerId: string,
  approve: boolean,
  ids: string[] | undefined,
  advice?: string | null,
): Promise<BulkDecisionResult> {
  const pending = await listProposals(env, ownerId, 'pending')
  const selected = ids === undefined || ids.length === 0
    ? pending
    : pending.filter(proposal => ids.includes(proposal.id))
  const ordered = approve
    ? [...selected].sort((left, right) =>
        APPROVE_ORDER.indexOf(left.kind as typeof APPROVE_ORDER[number])
        - APPROVE_ORDER.indexOf(right.kind as typeof APPROVE_ORDER[number])
        || left.createdAt.localeCompare(right.createdAt),
      )
    : selected

  const failed: BulkDecisionResult['failed'] = []
  let decided = 0
  for (const proposal of ordered) {
    try {
      // Advice is stored once after the whole batch, not per proposal.
      await decideProposal(env, principal, ownerId, proposal.id, approve, null)
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
  if (!approve && advice !== undefined && advice !== null && decided > 0)
    await appendPendingAdvice(env, ownerId, advice)
  return { decided, failed }
}

async function approveCategory(
  env: Env,
  ownerId: string,
  proposalId: string,
  payloadJson: string,
): Promise<void> {
  const payload = JSON.parse(payloadJson) as {
    parentId: string | null
    slug: string
    label: string
    description: string
    boundary: string
    axisHint: string | null
  }
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, axis_hint, depth, member_count, state, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', 'user', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
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
}

async function recordHumanDecision(
  env: Env,
  ownerId: string,
  runId: string,
  action: ActionRecord,
): Promise<void> {
  const last = await env.DB.prepare(
    'SELECT COALESCE(max(call_index), 0) + 1 AS next FROM catalog_actions WHERE run_id = ? AND batch = -3',
  )
    .bind(runId)
    .first<{ next: number }>()
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect, memory_id, category_id, target_category_id, target_project, arguments_json, rationale, decision, created_at)
     VALUES (?, ?, -3, 0, ?, ?, ?, 'proposal', ?, ?, ?, ?, '{}', ?, ?, ?)
     ON CONFLICT(run_id, batch, turn, call_index) DO NOTHING`,
  )
    .bind(
      runId,
      ownerId,
      last?.next ?? 1,
      action.kind,
      action.kind,
      action.memoryId ?? null,
      action.categoryId ?? null,
      action.targetCategoryId ?? null,
      action.targetProject ?? null,
      action.rationale ?? null,
      action.decision,
      isoNow(),
    )
    .run()
}
