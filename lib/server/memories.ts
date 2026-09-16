import type { Memory, MemoryInput, MemoryRevision, Principal } from '../contracts'
import type { Balance } from './catalog/balance'
import type { Env } from './env'
import { z } from 'zod'
import { createSchema, projectSchema, searchSchema, updateSchema } from '../contracts'
import { allocate, deviation, MAX_ROUTED_CATEGORIES, membersOf, scoreCategories, standardize } from './catalog/balance'
import { digest } from './crypto'
import { AppError, requirePermission } from './errors'
import { ftsQuery, fuseRankings, terms } from './search'

export interface MemoryRow {
  id: string
  owner_id: string
  project: string
  title: string
  content: string
  kind: MemoryInput['kind']
  tags: string
  source: string
  fingerprint: string
  version: number
  deleted: number
  created_at: string
  updated_at: string
}
export function serialize(row: MemoryRow): Memory {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    content: row.content,
    kind: row.kind,
    tags: z.array(z.string()).parse(JSON.parse(row.tags)),
    source: row.source,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
async function fingerprint(input: MemoryInput): Promise<string> {
  return digest(
    `${input.title.trim().normalize('NFKC').toLowerCase()}\n${input.content.trim().normalize('NFKC').toLowerCase()}`,
  )
}
function searchText(input: MemoryInput): string {
  return terms(`${input.title} ${input.content} ${input.tags.join(' ')}`).join(
    ' ',
  )
}
export async function getRow(
  env: Env,
  principal: Principal,
  id: string,
): Promise<MemoryRow> {
  const row = await env.DB.prepare(
    'SELECT * FROM memories WHERE id = ? AND owner_id = ? AND deleted = 0',
  )
    .bind(id, principal.ownerId)
    .first<MemoryRow>()
  if (!row || (principal.project !== null && row.project !== principal.project))
    throw new AppError('NOT_FOUND', 'Memory not found.')
  return row
}
export async function getMemory(
  env: Env,
  principal: Principal,
  id: string,
): Promise<Memory> {
  requirePermission(principal, 'memory:read')
  return serialize(await getRow(env, principal, id))
}
export async function listMemories(
  env: Env,
  principal: Principal,
  project: string,
  offset: number,
): Promise<Memory[]> {
  requirePermission(principal, 'memory:read', project)
  const rows = await env.DB.prepare(
    'SELECT * FROM memories WHERE owner_id = ? AND project = ? AND deleted = 0 ORDER BY updated_at DESC, id LIMIT 30 OFFSET ?',
  )
    .bind(principal.ownerId, project, offset)
    .all<MemoryRow>()
  return rows.results.map(serialize)
}
export async function createMemory(
  env: Env,
  principal: Principal,
  value: unknown,
): Promise<Memory> {
  const input = createSchema.parse(value)
  requirePermission(principal, 'memory:write', input.project)
  const hash = await fingerprint(input)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  // Both deduplication keys are enforced by SQLite, including concurrent writers.
  await env.DB.prepare(
    `INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint, idempotency_key, search_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  )
    .bind(
      id,
      principal.ownerId,
      input.project,
      input.title,
      input.content,
      input.kind,
      JSON.stringify(input.tags),
      input.source,
      hash,
      input.idempotencyKey,
      searchText(input),
      now,
      now,
    )
    .run()
  const row = await env.DB.prepare(
    'SELECT * FROM memories WHERE owner_id = ? AND (idempotency_key = ? OR (project = ? AND fingerprint = ?)) ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END LIMIT 1',
  )
    .bind(
      principal.ownerId,
      input.idempotencyKey,
      input.project,
      hash,
      input.idempotencyKey,
    )
    .first<MemoryRow>()
  if (!row || row.deleted) {
    throw new AppError('FORGOTTEN', 'An identical memory was forgotten. Do not automatically save it again.')
  }
  if (
    row.project !== input.project
    || row.fingerprint !== hash
    || row.kind !== input.kind
    || row.tags !== JSON.stringify(input.tags)
    || row.source !== input.source
  ) {
    throw new AppError('CONFLICT', 'The idempotency key or content already exists with different fields. Read the current memory before editing.')
  }
  return serialize(row)
}
export async function updateMemory(
  env: Env,
  principal: Principal,
  id: string,
  value: unknown,
): Promise<Memory> {
  const input = updateSchema.parse(value)
  requirePermission(principal, 'memory:write', input.project)
  const previous = await getRow(env, principal, id)
  if (input.project !== previous.project) {
    throw new AppError('IMMUTABLE_PROJECT', 'A memory cannot be moved to another project.')
  }
  const hash = await fingerprint(input)
  const duplicate = await env.DB.prepare(
    'SELECT id FROM memories WHERE owner_id = ? AND project = ? AND fingerprint = ? AND id != ?',
  )
    .bind(principal.ownerId, input.project, hash, id)
    .first()
  if (duplicate) {
    throw new AppError('CONFLICT', 'This content already exists or was forgotten.')
  }
  let changes: number
  try {
    const result = await env.DB.prepare(
      `UPDATE memories SET title = ?, content = ?, kind = ?, tags = ?, source = ?, fingerprint = ?, search_text = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
    )
      .bind(
        input.title,
        input.content,
        input.kind,
        JSON.stringify(input.tags),
        input.source,
        hash,
        searchText(input),
        new Date().toISOString(),
        id,
        principal.ownerId,
        input.expectedVersion,
      )
      .run()
    changes = result.meta.changes
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      throw new AppError('CONFLICT', 'This content already exists.')
    throw error
  }
  if (!changes) {
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before editing.')
  }
  return serialize(await getRow(env, principal, id))
}
/**
 * Moves a memory to another project.
 *
 * `project` stays immutable for every client: `update` still refuses to change
 * it. This exists only so a user can approve a proposal the catalog agent made,
 * because the agent itself must never move a memory — a move immediately
 * changes which project-restricted tokens can see it.
 *
 * The existing `memories_update` trigger queues a fresh index job, so the vector
 * is rewritten under the new project and the previous version is deleted.
 */
export async function moveMemoryProject(
  env: Env,
  principal: Principal,
  id: string,
  expectedVersion: number,
  targetProject: string,
): Promise<Memory> {
  const project = projectSchema.parse(targetProject)
  requirePermission(principal, 'memory:write', project)
  const previous = await getRow(env, principal, id)
  if (previous.project === project)
    return serialize(previous)
  let changes: number
  try {
    const result = await env.DB.prepare(
      `UPDATE memories SET project = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
    )
      .bind(project, new Date().toISOString(), id, principal.ownerId, expectedVersion)
      .run()
    changes = result.meta.changes
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      throw new AppError(
        'CONFLICT',
        'The target project already holds an identical memory. Read it before reconciling.',
      )
    }
    throw error
  }
  if (!changes)
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before moving it.')
  return serialize(await getRow(env, principal, id))
}
export async function deleteMemory(
  env: Env,
  principal: Principal,
  id: string,
  expectedVersion: number,
): Promise<void> {
  requirePermission(principal, 'memory:delete')
  await getRow(env, principal, id)
  const result = await env.DB.prepare(
    `UPDATE memories SET deleted = 1, title = '', content = '', source = '', tags = '[]', search_text = '', version = version + 1, updated_at = ?
    WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
  )
    .bind(new Date().toISOString(), id, principal.ownerId, expectedVersion)
    .run()
  if (!result.meta.changes) {
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before deleting.')
  }
}
export async function history(
  env: Env,
  principal: Principal,
  id: string,
): Promise<MemoryRevision[]> {
  requirePermission(principal, 'memory:read')
  await getRow(env, principal, id)
  const result = await env.DB.prepare(
    'SELECT version, title, content, kind, tags, source, created_at FROM revisions WHERE memory_id = ? ORDER BY version DESC LIMIT 50',
  )
    .bind(id)
    .all<MemoryRevision>()
  return result.results
}
export async function embed(env: Env, text: string): Promise<number[]> {
  if (!env.AI) {
    throw new AppError('INDEX_UNAVAILABLE', 'Semantic search is not configured.')
  }
  const result: unknown = await env.AI.run('@cf/baai/bge-m3', { text: [text] })
  const parsed = z
    .object({ data: z.array(z.array(z.number()).length(1024)).min(1) })
    .parse(result)
  const vector = parsed.data[0]
  if (!vector)
    throw new Error('No embedding returned')
  return vector
}
export async function searchMemories(
  env: Env,
  principal: Principal,
  value: unknown,
): Promise<{
  memories: Memory[]
  mode: 'hybrid' | 'keyword'
  degraded: boolean
  catalog: {
    routed: boolean
    balance: Balance
    categories: { id: string, label: string, candidates: number }[]
  } | null
}> {
  const input = searchSchema.parse(value)
  requirePermission(principal, 'memory:read', input.project)
  const query = ftsQuery(input.query)
  const keywords = query
    ? (
        await env.DB.prepare(
          `SELECT m.* FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.project = ? AND m.deleted = 0 ORDER BY bm25(memories_fts) LIMIT 40`,
        )
          .bind(query, principal.ownerId, input.project)
          .all<MemoryRow>()
      ).results
    : []
  let vectors: MemoryRow[] = []
  let mode: 'hybrid' | 'keyword' = 'keyword'
  if (env.AI && env.VECTORIZE) {
    try {
      const result = await env.VECTORIZE.query(await embed(env, input.query), {
        topK: 40,
        namespace: principal.ownerId,
        filter: { project: input.project },
        returnMetadata: 'all',
      })
      // Hydrate every vector from D1 and check its current revision and tenant.
      for (const match of result.matches) {
        const [id, version] = match.id.split(':')
        if (id === undefined || version === undefined)
          continue
        const row = await env.DB.prepare(
          'SELECT * FROM memories WHERE id = ? AND owner_id = ? AND project = ? AND version = ? AND deleted = 0',
        )
          .bind(id, principal.ownerId, input.project, Number(version))
          .first<MemoryRow>()
        if (row)
          vectors.push(row)
      }
      mode = 'hybrid'
    }
    catch {
      vectors = []
    }
  }
  const byId = new Map([...keywords, ...vectors].map(row => [row.id, row]))
  const keywordIds = keywords.map(row => row.id)
  const vectorIds = vectors.map(row => row.id)
  const flat = fuseRankings([keywordIds, vectorIds])

  if (input.mode !== 'catalog' || flat.length === 0) {
    return {
      memories: flat
        .slice(0, input.limit)
        .flatMap(id => memoryOf(byId, id)),
      mode,
      degraded: mode === 'keyword',
      catalog: input.mode === 'catalog'
        ? { routed: false, balance: input.balance, categories: [] }
        : null,
    }
  }

  const routed = await routeThroughCatalog(env, principal, input, { flat, byId, query })
  return {
    memories: routed.ranking.slice(0, input.limit).flatMap(id => memoryOf(byId, id)),
    mode,
    degraded: mode === 'keyword',
    catalog: { routed: routed.routed, balance: input.balance, categories: routed.categories },
  }
}

function memoryOf(byId: Map<string, MemoryRow>, id: string): Memory[] {
  const row = byId.get(id)
  return row ? [serialize(row)] : []
}

/**
 * Catalog-routed retrieval.
 *
 * The flat ranking is always one of the fused lists, never a fallback appended
 * at the end. Measured router precision is poor enough that this has to be the
 * primary safety net: the best supervised vertical selection reached 0.583
 * precision, 26.3% of queries had no relevant vertical at all (Arguello et al.,
 * SIGIR 2009), and RAPTOR measured flattened retrieval beating level-by-level
 * tree traversal. A routing miss therefore costs ranking quality, never recall.
 *
 * Each selected category contributes a truncated list, so a large category
 * cannot supply every candidate, and every selected category keeps at least one
 * slot.
 */
async function routeThroughCatalog(
  env: Env,
  principal: Principal,
  input: z.infer<typeof searchSchema>,
  pool: { flat: string[], byId: Map<string, MemoryRow>, query: string },
): Promise<{
  routed: boolean
  ranking: string[]
  categories: { id: string, label: string, candidates: number }[]
}> {
  const categories = await env.DB.prepare(
    'SELECT id, label, description, boundary, member_count FROM categories WHERE owner_id = ? AND state = \'active\'',
  )
    .bind(principal.ownerId)
    .all<{ id: string, label: string, description: string, boundary: string, member_count: number }>()
  const scores = scoreCategories(categories.results, terms(input.query))
  const selected = [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_ROUTED_CATEGORIES)
    .map(([id]) => categories.results.find(category => category.id === id))
    .filter((category): category is NonNullable<typeof category> => category !== undefined)
  if (selected.length === 0)
    return { routed: false, ranking: pool.flat, categories: [] }

  const members = await membersOf(env, principal.ownerId, selected.map(category => category.id))
  const position = new Map(pool.flat.map((id, index) => [id, index]))
  const lists: string[][] = [pool.flat]
  const reported: { id: string, label: string, candidates: number }[] = []
  const sizes = new Map<string, number>()
  const deviations = new Map<string, number>()

  for (const category of selected) {
    const ids = members.get(category.id) ?? []
    const inPool = ids
      .filter(id => position.has(id))
      .sort((left, right) => (position.get(left) ?? 0) - (position.get(right) ?? 0))
    // A category with no candidates in the pool is not empty, it is merely
    // crowded out; one bounded query asks for it directly. Only the score
    // ranking is normalized, so the ranks stay comparable across categories.
    const ranked = inPool.length > 0
      ? inPool
      : await crowdedOut(env, principal, input.project, pool.query, category.id)
    if (ranked.length === 0) {
      reported.push({ id: category.id, label: category.label, candidates: 0 })
      continue
    }
    const normalized = standardize(ranked.map((_, index) => ranked.length - index))
    sizes.set(category.id, Math.max(1, ids.length))
    deviations.set(category.id, deviation(normalized))
    reported.push({ id: category.id, label: category.label, candidates: ranked.length })
    lists.push(ranked)
  }

  const allocation = allocate(input.balance, { sizes, deviations, total: input.limit })
  const truncated = lists.slice(1).map((list, index) => {
    const category = selected[index]
    const budget = category === undefined ? list.length : allocation.get(category.id) ?? 1
    return list.slice(0, Math.max(1, budget * 2))
  })
  // Fusing keeps a partial routing answer adjacent to the flat one instead of
  // replacing it: RRF sums ranks, so an item both routes and matches flat wins.
  return {
    routed: true,
    ranking: fuseRankings([pool.flat, ...truncated]),
    categories: reported,
  }
}

/** One bounded query for a category the flat pool did not reach. */
async function crowdedOut(
  env: Env,
  principal: Principal,
  project: string,
  query: string,
  categoryId: string,
): Promise<string[]> {
  if (query.length === 0)
    return []
  const rows = await env.DB.prepare(
    `SELECT m.id FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
     WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.project = ? AND m.deleted = 0
       AND m.id IN (SELECT memory_id FROM memory_categories WHERE category_id = ? AND owner_id = ?)
     ORDER BY bm25(memories_fts) LIMIT 20`,
  )
    .bind(query, principal.ownerId, project, categoryId, principal.ownerId)
    .all<{ id: string }>()
  return rows.results.map(row => row.id)
}
