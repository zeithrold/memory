import type { Env } from '../env'
import { z } from 'zod'
import { AppError } from '../errors'

import { isoNow } from './query-common'

type RevertAction = {

  id: number
  kind: string
  decision: string
  memory_id: string | null
  category_id: string | null
  before_json: string | null
  after_json: string | null

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
  if (run === null) {
    throw new AppError('RUN_NOT_FOUND', 'No catalog run exists with that identifier.')
  }
  if (run.status === 'running' || run.status === 'queued') {
    throw new AppError(
      'RUN_IN_PROGRESS',
      'A run that is still in progress cannot be reverted.',
    )
  }
  if (run.status === 'reverted') {
    return { reverted: 0, skipped: 0 }
  }

  const applied = await env.DB.prepare(
    `SELECT id, kind, decision, memory_id, category_id, before_json, after_json
     FROM catalog_actions
     WHERE run_id = ? AND owner_id = ? AND decision = 'applied' AND revert_of IS NULL
     ORDER BY id DESC`,
  )
    .bind(runId, ownerId)
    .all<RevertAction>()

  let reverted = 0
  let skipped = 0
  const touched = new Set<string>()
  for (const action of applied.results) {
    const inverse = await invert(env, ownerId, action)
    if (inverse === null) {
      skipped += 1
      continue
    }
    if (action.memory_id !== null) {
      touched.add(action.memory_id)
    }
    await recordRevert(env, ownerId, { runId, action })
    reverted += 1
  }
  for (const categoryId of touched) {
    await env.DB.prepare(
      ('UPDATE categories SET member_count = (SELECT count(*) FROM '
        + 'memory_categories WHERE category_id = categories.id), updated_at = ? WHERE '
        + 'id = ?'),
    )
      .bind(isoNow(), categoryId)
      .run()
  }
  await env.DB.prepare('UPDATE catalog_runs SET status = \'reverted\', finished_at = ? WHERE id = ?')
    .bind(isoNow(), runId)
    .run()
  return { reverted, skipped }
}

async function invert(env: Env, ownerId: string, action: RevertAction): Promise<true | null> {
  switch (action.kind) {
    case 'assign': return await invertAssignment(env, ownerId, action)
    case 'unassign': return await invertUnassignment(env, ownerId, action)
    case 'skip': return await invertSkip(env, ownerId, action)
    case 'create_category': return await invertCategoryCreation(env, ownerId, action)
    default: return null
  }
}

async function invertAssignment(
  env: Env,
  _ownerId: string,
  action: RevertAction,
): Promise<true | null> {
  if (action.memory_id === null || action.category_id === null) {
    return null
  }

  const before = parseArray(action.before_json)
  const previous = before.find(entry => entry.category_id === action.category_id)
  if (previous === undefined) {
    await env.DB.prepare('DELETE FROM memory_categories WHERE memory_id = ? AND category_id = ?')
      .bind(action.memory_id, action.category_id)
      .run()
  }
  else {
    await env.DB.prepare(
      ('UPDATE memory_categories SET is_primary = ?, confidence = ?, updated_at = ? '
        + 'WHERE memory_id = ? AND category_id = ?'),
    )
      .bind(
        previous.is_primary,
        previous.confidence,
        isoNow(),
        action.memory_id,
        action.category_id,
      )
      .run()
  }
  // Restore the primary flag of whatever this assignment displaced.
  const displaced = before.find(entry => entry.is_primary === 1 && entry.category_id !== action.category_id)
  if (displaced !== undefined) {
    await env.DB.prepare(
      'UPDATE memory_categories SET is_primary = 1, updated_at = ? WHERE memory_id = ? AND category_id = ?',
    )
      .bind(

        isoNow(),

        action.memory_id,

        displaced.category_id,
      )
      .run()
  }
  return true
}

async function invertUnassignment(
  env: Env,
  ownerId: string,
  action: RevertAction,
): Promise<true | null> {
  if (action.memory_id === null || action.category_id === null) {
    return null
  }

  const before = parseArray(action.before_json)
  const previous = before.find(entry => entry.category_id === action.category_id)
  if (previous === undefined) {
    return null
  }
  await env.DB.prepare(
    `INSERT INTO memory_categories(owner_id, memory_id, category_id, is_primary, confidence,
assigned_by, catalog_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'agent', 1, ?, ?)
       ON CONFLICT(memory_id, category_id) DO UPDATE SET is_primary = excluded.is_primary,
confidence = excluded.confidence`,
  )
    .bind(
      ownerId,
      action.memory_id,
      action.category_id,
      previous.is_primary,
      previous.confidence,
      isoNow(),
      isoNow(),
    )
    .run()
  return true
}

async function invertSkip(
  env: Env,
  _ownerId: string,
  action: RevertAction,
): Promise<true | null> {
  if (action.memory_id === null) {
    return null
  }

  await env.DB.prepare('DELETE FROM catalog_skips WHERE memory_id = ?').bind(action.memory_id).run()
  return true
}

async function invertCategoryCreation(
  env: Env,
  ownerId: string,
  action: RevertAction,
): Promise<true | null> {
  if (action.category_id === null) {
    return null
  }

  // Only an empty category can be removed without orphaning memories.
  const members = await env.DB.prepare(
    'SELECT count(*) AS n FROM memory_categories WHERE category_id = ?',
  )
    .bind(action.category_id)
    .first<{ n: number }>()
  if ((members?.n ?? 0) > 0) {
    return null
  }
  await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner_id = ?')
    .bind(action.category_id, ownerId)
    .run()
  return true
}

function parseArray(
  raw: string | null,
): { category_id: string, is_primary: number, confidence: number }[] {
  if (raw === null) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return z.array(
      z.looseObject({ category_id: z.string(), is_primary: z.number(), confidence: z.number() }),
    )
      .parse(
        parsed,
      )
  }
  catch {
    return []
  }
}

async function recordRevert(
  env: Env,
  ownerId: string,
  options: { runId: string, action: RevertAction },
): Promise<void> {
  const { runId, action } = options
  await env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, arguments_json, rationale, decision, revert_of, created_at)
       SELECT ?, ?, -2, 0, COALESCE(max(call_index), 0) + 1, ?, 'revert', 'immediate',
?, ?, '{}', ?, 'applied', ?, ?
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
}
