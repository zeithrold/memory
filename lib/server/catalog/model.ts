import type { Env } from '../env'

/**
 * Row shapes and the per-turn snapshot the agent reasons over.
 *
 * The snapshot is loaded once per turn and passed to the policy layer and to
 * the tools, so every decision in a turn is made against one consistent view
 * rather than a view that drifts between tool calls.
 */
export type CategoryState = 'active' | 'pending_merge' | 'retired'

export interface CategoryRow {
  id: string
  owner_id: string
  parent_id: string | null
  slug: string
  label: string
  description: string
  boundary: string
  axis_hint: string | null
  depth: number
  member_count: number
  state: CategoryState
  created_by: 'agent' | 'user'
  created_at: string
  updated_at: string
}

export interface MembershipRow {
  memory_id: string
  category_id: string
  is_primary: number
  confidence: number
  updated_at: string
}

export interface BatchMemory {
  id: string
  project: string
  title: string
  kind: string
  tags: string[]
  version: number
  updated_at: string
  content?: string
}

export interface CatalogSnapshot {
  categories: CategoryRow[]
  memories: BatchMemory[]
  memberships: Map<string, MembershipRow[]>
}

export const IMPLICIT_SKIP_REASON = 'Left unclassified by the agent.'

/**
 * Deletes only system deferrals. NULL is supported during the rolling upgrade
 * from the first schema, where the fixed reason was the only discriminator.
 */
export async function clearImplicitSkips(env: Env, ownerId: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM catalog_skips
     WHERE owner_id = ?
       AND COALESCE(source, CASE WHEN reason = ? THEN 'implicit' ELSE 'explicit' END) = 'implicit'`,
  )
    .bind(ownerId, IMPLICIT_SKIP_REASON)
    .run()
}

/** Refreshes the materialized counters without changing scheduling metadata. */
export async function refreshCatalogCounts(env: Env, ownerId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO catalog_state(owner_id, version, category_count, assigned_count, orphan_count, skipped_count)
     VALUES (?, 1,
             (SELECT count(*) FROM categories WHERE owner_id = ? AND state != 'retired'),
             (SELECT count(*) FROM memory_categories WHERE owner_id = ?),
             (SELECT count(*) FROM memories m WHERE m.owner_id = ? AND m.deleted = 0
                AND NOT EXISTS (SELECT 1 FROM memory_categories mc WHERE mc.memory_id = m.id)),
             (SELECT count(*) FROM catalog_skips WHERE owner_id = ?))
     ON CONFLICT(owner_id) DO UPDATE SET
       category_count = excluded.category_count,
       assigned_count = excluded.assigned_count,
       orphan_count = excluded.orphan_count,
       skipped_count = excluded.skipped_count`,
  )
    .bind(ownerId, ownerId, ownerId, ownerId, ownerId)
    .run()
}

export async function loadCategories(env: Env, ownerId: string): Promise<CategoryRow[]> {
  const rows = await env.DB.prepare(
    `SELECT * FROM categories
     WHERE owner_id = ? AND state != 'retired'
     ORDER BY depth, slug`,
  )
    .bind(ownerId)
    .all<CategoryRow>()
  return rows.results
}

/**
 * Memberships for the given memories. Bundled into one query because D1 costs
 * 1000x more per written row than per read row, and a per-memory query would
 * also risk the Free plan's 50-query ceiling per invocation.
 */
export async function loadMemberships(
  env: Env,
  ownerId: string,
  memoryIds: string[],
): Promise<Map<string, MembershipRow[]>> {
  const byMemory = new Map<string, MembershipRow[]>()
  if (memoryIds.length === 0)
    return byMemory
  const placeholders = memoryIds.map(() => '?').join(', ')
  const rows = await env.DB.prepare(
    `SELECT memory_id, category_id, is_primary, confidence, updated_at
     FROM memory_categories
     WHERE owner_id = ? AND memory_id IN (${placeholders})`,
  )
    .bind(ownerId, ...memoryIds)
    .all<MembershipRow>()
  for (const row of rows.results) {
    const list = byMemory.get(row.memory_id) ?? []
    list.push(row)
    byMemory.set(row.memory_id, list)
  }
  return byMemory
}

export async function loadSnapshot(
  env: Env,
  ownerId: string,
  memoryIds: string[],
  includeContent: boolean,
): Promise<CatalogSnapshot> {
  const [categories, memberships, memories] = await Promise.all([
    loadCategories(env, ownerId),
    loadMemberships(env, ownerId, memoryIds),
    loadBatchMemories(env, ownerId, memoryIds, includeContent),
  ])
  return { categories, memories, memberships }
}

export async function loadBatchMemories(
  env: Env,
  ownerId: string,
  memoryIds: string[],
  includeContent: boolean,
): Promise<BatchMemory[]> {
  if (memoryIds.length === 0)
    return []
  const placeholders = memoryIds.map(() => '?').join(', ')
  const rows = await env.DB.prepare(
    `SELECT id, project, title, kind, tags, version, updated_at, deleted, content
     FROM memories
     WHERE owner_id = ? AND id IN (${placeholders})`,
  )
    .bind(ownerId, ...memoryIds)
    .all<{
    id: string
    project: string
    title: string
    kind: string
    tags: string
    version: number
    updated_at: string
    deleted: number
    content: string
  }>()
  return rows.results
    .filter(row => row.deleted === 0)
    .map(row => ({
      id: row.id,
      project: row.project,
      title: row.title,
      kind: row.kind,
      tags: parseTags(row.tags),
      version: row.version,
      updated_at: row.updated_at,
      ...(includeContent ? { content: row.content } : {}),
    }))
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  }
  catch {
    return []
  }
}

/**
 * The next batch of work for one account.
 *
 * A memory needs attention when it has never been classified, or when its last
 * classification predates its own last edit. Comparing per memory rather than
 * against a global watermark is what makes a batch that stopped early - for
 * budget, or for a provider failure - self-heal on the next run instead of
 * leaving those edits behind the cursor forever.
 *
 * Once nothing needs attention, memories whose classification has settled for
 * longer than the review window are offered for a fresh look, so the catalog
 * can follow a changing library without re-reading everything every run.
 *
 * A skip suppresses both paths until the memory itself changes, and stops doing
 * so after a few attempts, so one unclassifiable entry cannot occupy the head
 * of every batch.
 */
export async function selectBatch(
  env: Env,
  ownerId: string,
  limit: number,
  reviewCutoff: string,
): Promise<string[]> {
  const rows = await env.DB.prepare(
    `WITH candidate AS (
       SELECT m.id, m.updated_at, m.version,
              (SELECT max(mc.updated_at) FROM memory_categories mc
                WHERE mc.memory_id = m.id AND mc.owner_id = m.owner_id) AS classified_at
       FROM memories m
       WHERE m.owner_id = ? AND m.deleted = 0
     )
     SELECT c.id, (c.classified_at IS NULL OR c.classified_at < c.updated_at) AS needs_work
     FROM candidate c
     LEFT JOIN catalog_skips s ON s.memory_id = c.id AND s.owner_id = ?
     WHERE (c.classified_at IS NULL OR c.classified_at < c.updated_at OR c.classified_at < ?)
       AND (
         s.memory_id IS NULL
         OR s.memory_version != c.version
         OR (
           COALESCE(s.source, CASE WHEN s.reason = ? THEN 'implicit' ELSE 'explicit' END) = 'implicit'
           AND s.attempts < 3
         )
       )
     ORDER BY needs_work DESC, c.updated_at, c.id
     LIMIT ?`,
  )
    .bind(ownerId, ownerId, reviewCutoff, IMPLICIT_SKIP_REASON, limit)
    .all<{ id: string, needs_work: number }>()
  return rows.results.map(row => row.id)
}

export interface CatalogStateRow {
  owner_id: string
  version: number
  last_run_at: string | null
  next_run_at: string | null
  category_count: number
  assigned_count: number
  orphan_count: number
  skipped_count: number
  enabled: number
}

export async function loadState(env: Env, ownerId: string): Promise<CatalogStateRow | null> {
  return env.DB.prepare('SELECT * FROM catalog_state WHERE owner_id = ?')
    .bind(ownerId)
    .first<CatalogStateRow>()
}

/** Trusted identities for one account, used by the structural tools. */
export interface OwnerScope {
  ownerId: string
  /** Memory ids the agent is allowed to touch in this batch. */
  batchMemoryIds: Set<string>
}
