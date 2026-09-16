import type { Memory, MemoryInput, MemoryRevision, Principal } from '../contracts'
import type { Env } from './env'
import { z } from 'zod'
import { createSchema, searchSchema, updateSchema } from '../contracts'
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
    throw new AppError(404, 'NOT_FOUND', 'Memory not found.')
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
    throw new AppError(
      409,
      'FORGOTTEN',
      'An identical memory was forgotten. Do not automatically save it again.',
    )
  }
  if (
    row.project !== input.project
    || row.fingerprint !== hash
    || row.kind !== input.kind
    || row.tags !== JSON.stringify(input.tags)
    || row.source !== input.source
  ) {
    throw new AppError(
      409,
      'CONFLICT',
      'The idempotency key or content already exists with different fields. Read the current memory before editing.',
    )
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
    throw new AppError(
      400,
      'IMMUTABLE_PROJECT',
      'A memory cannot be moved to another project.',
    )
  }
  const hash = await fingerprint(input)
  const duplicate = await env.DB.prepare(
    'SELECT id FROM memories WHERE owner_id = ? AND project = ? AND fingerprint = ? AND id != ?',
  )
    .bind(principal.ownerId, input.project, hash, id)
    .first()
  if (duplicate) {
    throw new AppError(
      409,
      'CONFLICT',
      'This content already exists or was forgotten.',
    )
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
      throw new AppError(409, 'CONFLICT', 'This content already exists.')
    throw error
  }
  if (!changes) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'The memory changed. Read it again before editing.',
    )
  }
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
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'The memory changed. Read it again before deleting.',
    )
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
    throw new AppError(
      503,
      'INDEX_UNAVAILABLE',
      'Semantic search is not configured.',
    )
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
  const memories = fuseRankings([
    keywords.map(row => row.id),
    vectors.map(row => row.id),
  ])
    .slice(0, input.limit)
    .flatMap((id) => {
      const row = byId.get(id)
      return row ? [serialize(row)] : []
    })
  return { memories, mode, degraded: mode === 'keyword' }
}
