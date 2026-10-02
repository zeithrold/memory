import type { z } from 'zod'
import type { Principal, searchSchema } from '../contracts'
import type { Env } from './env'
import type { MemoryRow } from './memory-rows'
import { allocate, deviation, MAX_ROUTED_CATEGORIES, membersOf, scoreCategories, standardize } from './catalog/balance'
import { categoryTreeScope, crowdedOut } from './memory-search'
import { fuseRankings, terms } from './search'

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

interface RouteCategoryCandidatesContext {
  env: Env
  principal: Principal
  selected: { id: string, label: string, description: string, boundary: string, member_count: number }[]
  pool: { flat: string[], byId: Map<string, MemoryRow>, query: string }
  input: {
    query: string
    project: string
    limit: number
    mode: 'flat' | 'catalog'
    balance: 'equal' | 'sqrt' | 'neyman'
    categoryIds?: string[] | undefined
  }
}
type RouteCategoryCandidatesResult = Promise<{
  sizes: Map<string, number>
  deviations: Map<string, number>
  lists: string[][]
  reported: { id: string, label: string, candidates: number }[]
}>

async function routeCategoryCandidates(
  context: RouteCategoryCandidatesContext,
): RouteCategoryCandidatesResult {
  const { env, principal, selected, pool, input } = context
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
      : await crowdedOut(
          env,
          principal,
          { project: input.project, query: pool.query, categoryId: category.id },
        )
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
  return { sizes, deviations, lists, reported }
}
interface RouteThroughCatalogPool { flat: string[], byId: Map<string, MemoryRow>, query: string }

export async function routeThroughCatalog(
  env: Env,
  principal: Principal,
  input: z.infer<typeof searchSchema>,
  pool: RouteThroughCatalogPool,
): Promise<{
  routed: boolean
  ranking: string[]
  categories: { id: string, label: string, candidates: number }[]
}> {
  const scope = categoryTreeScope(input.categoryIds)
  const categories = await env.DB.prepare(
    `SELECT id, label, description, boundary, member_count FROM categories
     WHERE owner_id = ? AND state = 'active' ${scope.clause}`,
  )
    .bind(principal.ownerId, ...scope.bindings)
    .all<{ id: string, label: string, description: string, boundary: string, member_count: number }>()
  const scores = scoreCategories(categories.results, terms(input.query))
  const selected = [
    ...scores.entries(),
  ]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_ROUTED_CATEGORIES)
    .map(([id]) => categories.results.find(category => category.id === id))
    .filter((category): category is NonNullable<typeof category> => category !== undefined)
  if (selected.length === 0) {
    return { routed: false, ranking: pool.flat, categories: [] }
  }

  const {
    sizes,
    deviations,
    lists,
    reported,
  } = await routeCategoryCandidates({
    env,
    principal,
    selected,
    pool,
    input,
  })

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
    ranking: fuseRankings([
      pool.flat,
      ...truncated,
    ]),
    categories: reported,
  }
}
