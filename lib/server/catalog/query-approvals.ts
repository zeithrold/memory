import type { Env } from '../env'
import type { ActionRecord } from './tools'
import { z } from 'zod'
import { AppError } from '../errors'
import {
  catalogCountsStatement,
} from './model'
import { isoNow } from './query-common'

export async function approveCategory(
  env: Env,
  ownerId: string,
  _proposalId: string,
  payloadJson: string,
): Promise<void> {
  const payload = z.looseObject({
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
  }).parse(JSON.parse(payloadJson))
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, axis_hint,
depth, member_count, state, created_by, created_at, updated_at)
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

export async function recordHumanDecision(
  env: Env,
  ownerId: string,
  runId: string,
  action: ActionRecord,
): Promise<void> {
  await humanDecisionStatement(env, ownerId, runId, action).run()
}

function humanDecisionStatement(
  env: Env,
  ownerId: string,
  runId: string,
  action: ActionRecord,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO catalog_actions(run_id, owner_id, batch, turn, call_index, tool, kind, effect,
memory_id, category_id, target_category_id, target_project, arguments_json, rationale,
decision, created_at)
     VALUES (?, ?, -3, 0,
       (SELECT COALESCE(max(call_index), 0) + 1 FROM catalog_actions WHERE run_id = ? AND
batch = -3),
       ?, ?, 'proposal', ?, ?, ?, ?, '{}', ?, ?, ?)`,
  )
    .bind(
      runId,
      ownerId,
      runId,
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
}

type ApproveMergeOptions = {
  proposalId: string
  runId: string
  action: ActionRecord
  fromId: string
  intoId: string
}

export async function approveMerge(
  env: Env,
  ownerId: string,
  options: ApproveMergeOptions,
): Promise<void> {
  const { proposalId, runId, action, fromId, intoId } = options

  await validateMerge(env, ownerId, fromId, intoId)

  const timestamp = isoNow()
  await env.DB.batch(
    [
    // A primary source membership wins an overlap, carrying its metadata into
    // the target. Otherwise keep the existing target membership. Delete each
    // losing row before moving so both membership uniqueness rules hold.
      env.DB.prepare(
        `DELETE FROM memory_categories
       WHERE owner_id = ? AND category_id = ? AND memory_id IN (
         SELECT memory_id FROM memory_categories
         WHERE owner_id = ? AND category_id = ? AND is_primary = 1
       )`,
      ).bind(ownerId, intoId, ownerId, fromId),
      env.DB.prepare(
        `DELETE FROM memory_categories
       WHERE owner_id = ? AND category_id = ? AND memory_id IN (
         SELECT memory_id FROM memory_categories WHERE owner_id = ? AND category_id = ?
       )`,
      ).bind(ownerId, fromId, ownerId, intoId),
      env.DB.prepare(
        'UPDATE memory_categories SET category_id = ?, updated_at = ? WHERE category_id = ? AND owner_id = ?',
      )
        .bind(

          intoId,

          timestamp,

          fromId,

          ownerId,
        ),
      env.DB.prepare(
        'UPDATE categories SET state = \'retired\', member_count = 0, updated_at = ? WHERE id = ? AND owner_id = ?',
      )
        .bind(

          timestamp,

          fromId,

          ownerId,
        ),
      env.DB.prepare(
        ('UPDATE categories SET member_count = (SELECT count(*) FROM '
          + 'memory_categories WHERE category_id = categories.id AND owner_id = ?), '
          + 'updated_at = ? WHERE id = ? AND owner_id = ?'),
      ).bind(ownerId, timestamp, intoId, ownerId),
      catalogCountsStatement(env, ownerId),
      env.DB.prepare(
        'UPDATE catalog_proposals SET status = \'approved\', resolved_at = ? WHERE id = ? AND owner_id = ?',
      )
        .bind(

          timestamp,

          proposalId,

          ownerId,
        ),
      humanDecisionStatement(env, ownerId, runId, action),
    ],
  )
}

async function validateMerge(
  env: Env,
  ownerId: string,
  fromId: string,
  intoId: string,
): Promise<void> {
  if (fromId === intoId) {
    throw new AppError('CONFLICT', 'A category cannot be merged into itself.')
  }
  const categories = await env.DB.prepare(
    'SELECT id FROM categories WHERE owner_id = ? AND id IN (?, ?) AND state != \'retired\'',
  ).bind(ownerId, fromId, intoId).all<{ id: string }>()
  if (categories.results.length !== 2) {
    throw new AppError('CONFLICT', 'Both categories must exist and be active to merge.')
  }
}
