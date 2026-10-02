import type { Memory, Principal } from '../contracts'
import type { Balance } from './catalog/balance'
import type { Env } from './env'
import type { MemoryRow } from './memory-rows'
import { z } from 'zod'
import { searchSchema } from '../contracts'
import { AppError, requirePermission } from './errors'
import { routeThroughCatalog } from './memory-routing'
import { serialize } from './memory-rows'
import { ftsQuery, fuseRankings } from './search'

export async function embed(env: Env, text: string): Promise<number[]> {
  if (!(env.AI !== undefined)) {
    throw new AppError('INDEX_UNAVAILABLE', 'Semantic search is not configured.')
  }
  const result: unknown = await env.AI.run('@cf/baai/bge-m3', { text: [text] })
  const parsed = z
    .object({ data: z.array(z.array(z.number()).length(1024)).min(1) })
    .parse(result)
  const vector = parsed.data[0]
  if (!(vector !== undefined)) {
    throw new Error('No embedding returned')
  }
  return vector
}

interface KeywordCandidatesContext {
  input: {
    query: string
    project: string
    limit: number
    mode: 'flat' | 'catalog'
    balance: 'equal' | 'sqrt' | 'neyman'
    categoryIds?: string[] | undefined
  }
  query: string
  env: Env
  principal: Principal
}
async function keywordCandidates(context: KeywordCandidatesContext): Promise<{
  explicitScope: { clause: string, bindings: (ownerId: string) => string[] }
  keywords: MemoryRow[]
}> {
  const { input, query, env, principal } = context
  const explicitScope = categoryScope(input.categoryIds)
  const keywords = (query.length > 0)
    ? (
        await env.DB.prepare(
          `SELECT m.* FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
           WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.project = ? AND m.deleted
= 0
           ${explicitScope.clause}
           ORDER BY bm25(memories_fts) LIMIT 40`,
        )
          .bind(
            query,
            principal.ownerId,
            input.project,
            ...explicitScope.bindings(principal.ownerId),
          )
          .all<MemoryRow>()
      ).results
    : []
  return { explicitScope, keywords }
}

interface VectorCandidatesContext {
  env: Env
  input: {
    query: string
    project: string
    limit: number
    mode: 'flat' | 'catalog'
    balance: 'equal' | 'sqrt' | 'neyman'
    categoryIds?: string[] | undefined
  }
  principal: Principal
  explicitScope: { clause: string, bindings: (ownerId: string) => string[] }
}
async function vectorCandidates(
  context: VectorCandidatesContext,
): Promise<{ vectors: MemoryRow[], mode: 'hybrid' | 'keyword' }> {
  const { env, input, principal, explicitScope } = context
  let vectors: MemoryRow[] = []
  let mode: 'hybrid' | 'keyword' = 'keyword'
  if ((env.AI !== undefined) && (env.VECTORIZE !== undefined)) {
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
        if (id === undefined || version === undefined) {
          continue
        }
        const row = await env.DB.prepare(
          `SELECT m.* FROM memories m
           WHERE m.id = ? AND m.owner_id = ? AND m.project = ? AND m.version = ? AND m.deleted
= 0
           ${explicitScope.clause}`,
        )
          .bind(
            id,
            principal.ownerId,
            input.project,
            Number(version),
            ...explicitScope.bindings(principal.ownerId),
          )
          .first<MemoryRow>()
        if ((row !== null)) {
          vectors.push(row)
        }
      }
      mode = 'hybrid'
    }
    catch {
      vectors = []
    }
  }
  return { vectors, mode }
}
type SearchMemoriesResult = Promise<{
  memories: Memory[]
  mode: 'hybrid' | 'keyword'
  degraded: boolean
  catalog: {
    routed: boolean
    balance: Balance
    categories: { id: string, label: string, candidates: number }[]
  } | null
}>

export async function searchMemories(
  env: Env,
  principal: Principal,
  value: unknown,
): SearchMemoriesResult {
  const input = searchSchema.parse(value)
  requirePermission(principal, 'memory:read', input.project)
  const query = ftsQuery(input.query)
  const { explicitScope, keywords } = await keywordCandidates({ input, query, env, principal })
  const { vectors, mode } = await vectorCandidates({ env, input, principal, explicitScope })
  const byId = new Map([
    ...keywords,
    ...vectors,
  ].map(row => [row.id, row]))
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
  return (row !== undefined)
    ? [
        serialize(row),
      ]
    : []
}

export function categoryTreeScope(categoryIds: string[] | undefined): {
  clause: string
  bindings: string[]
} {
  if (categoryIds === undefined) {
    return { clause: '', bindings: [] }
  }
  const placeholders = categoryIds.map(() => '?').join(', ')
  return {
    clause: `AND (id IN (${placeholders}) OR parent_id IN (${placeholders}))`,
    bindings: [
      ...categoryIds,
      ...categoryIds,
    ],
  }
}

function categoryScope(categoryIds: string[] | undefined): {
  clause: string
  bindings: (ownerId: string) => string[]
} {
  if (categoryIds === undefined) {
    return { clause: '', bindings: () => [] }
  }
  const placeholders = categoryIds.map(() => '?').join(', ')
  return {
    clause: `AND EXISTS (
      SELECT 1 FROM memory_categories scoped_mc
      JOIN categories scoped_c ON scoped_c.id = scoped_mc.category_id
      WHERE scoped_mc.memory_id = m.id
        AND scoped_mc.owner_id = ?
        AND scoped_c.owner_id = ?
        AND scoped_c.state = 'active'
        AND (scoped_c.id IN (${placeholders}) OR scoped_c.parent_id IN (${placeholders}))
    )`,
    bindings: ownerId => [
      ownerId,
      ownerId,
      ...categoryIds,
      ...categoryIds,
    ],
  }
}

/** One bounded query for a category the flat pool did not reach. */
export async function crowdedOut(
  env: Env,
  principal: Principal,
  options: { project: string, query: string, categoryId: string },
): Promise<string[]> {
  const { project, query, categoryId } = options

  if (query.length === 0) {
    return []
  }
  const rows = await env.DB.prepare(
    `SELECT m.id FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
     WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.project = ? AND m.deleted = 0
       AND m.id IN (SELECT memory_id FROM memory_categories WHERE category_id = ? AND owner_id
= ?)
     ORDER BY bm25(memories_fts) LIMIT 20`,
  )
    .bind(query, principal.ownerId, project, categoryId, principal.ownerId)
    .all<{ id: string }>()
  return rows.results.map(row => row.id)
}
