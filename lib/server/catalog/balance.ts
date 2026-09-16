import type { Env } from '../env'

/**
 * Balanced allocation across categories.
 *
 * The naive fixes are measured failures, so each rule here has a reason:
 *
 * - Round-robin interleaving of per-collection rankings scored -53.5% average
 *   precision against a normalized-score merge (Callan, Lu & Croft, SIGIR 1995),
 *   so categories are fused through the existing RRF rather than interleaved.
 * - Allocating budget proportionally to `sqrt(size)` has no IR literature
 *   behind it; the method it comes from is power allocation in stratified
 *   sampling, `n_c = n * N_c^a / sum(N_j^a)`, where `a = 0.5` is `sqrt` and
 *   `a = 0` is equal allocation.
 * - Neyman allocation, `n_c` proportional to `N_c * S_c`, is the
 *   variance-optimal rule: a small category whose scores are internally varied
 *   earns budget on principle rather than by being small.
 *
 * Every selected category keeps a floor of one slot, which is the actual
 * anti-starvation mechanism; a weight alone only changes the odds.
 */
export type Balance = 'equal' | 'sqrt' | 'neyman'
export const MAX_ROUTED_CATEGORIES = 3

export interface AllocationInput {
  sizes: Map<string, number>
  /** Score spread per category, used by the Neyman rule. */
  deviations: Map<string, number>
  total: number
}

export function allocate(balance: Balance, input: AllocationInput): Map<string, number> {
  const ids = [...input.sizes.keys()]
  const allocation = new Map<string, number>()
  if (ids.length === 0 || input.total <= 0)
    return allocation
  const total = Math.min(input.total, sum([...input.sizes.values()]))
  const weights = new Map<string, number>()
  for (const id of ids) {
    const size = Math.max(1, input.sizes.get(id) ?? 1)
    if (balance === 'equal')
      weights.set(id, 1)
    else if (balance === 'sqrt')
      weights.set(id, Math.sqrt(size))
    else
      weights.set(id, size * Math.max(input.deviations.get(id) ?? 1, 0.0001))
  }
  const weightSum = sum([...weights.values()])
  // The cap stops one category from taking the whole budget when the others
  // have no candidates at all, which is otherwise a legitimate outcome of the
  // formula and defeats the purpose of routing.
  const cap = Math.max(1, Math.ceil((total / ids.length) * 1.5))
  for (const id of ids) {
    const share = (total * (weights.get(id) ?? 0)) / weightSum
    allocation.set(id, Math.max(1, Math.min(cap, Math.round(share))))
  }
  return allocation
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** `(s - mean) / deviation`, the shift- and scale-invariant normalization. */
export function standardize(scores: number[]): number[] {
  if (scores.length === 0)
    return []
  const mean = sum(scores) / scores.length
  const variance = sum(scores.map(score => (score - mean) ** 2)) / scores.length
  const deviation = Math.sqrt(variance)
  if (deviation === 0)
    return scores.map(() => 0)
  return scores.map(score => (score - mean) / deviation)
}

export function deviation(scores: number[]): number {
  if (scores.length < 2)
    return 0
  const mean = sum(scores) / scores.length
  return Math.sqrt(sum(scores.map(score => (score - mean) ** 2)) / scores.length)
}

/**
 * Ranks the catalog against a query without a second index.
 *
 * Terms are matched against each category's label, description and boundary.
 * A category's own text is short and deliberately written to be discriminative,
 * so a term count with a length penalty is enough to pick a handful of
 * candidates, and it costs no embedding call — which matters under the Free
 * plan's per-step CPU budget.
 */
export function scoreCategories(
  categories: {
    id: string
    label: string
    description: string
    boundary: string
    member_count: number
  }[],
  terms: string[],
): Map<string, number> {
  const scores = new Map<string, number>()
  if (terms.length === 0)
    return scores
  for (const category of categories) {
    const haystack = `${category.label} ${category.description} ${category.boundary}`.toLowerCase()
    let hits = 0
    for (const term of terms) {
      if (haystack.includes(term))
        hits += 1
    }
    if (hits > 0)
      scores.set(category.id, hits / Math.sqrt(haystack.length))
  }
  return scores
}

export async function membersOf(
  env: Env,
  ownerId: string,
  categoryIds: string[],
): Promise<Map<string, string[]>> {
  const members = new Map<string, string[]>()
  if (categoryIds.length === 0)
    return members
  const placeholders = categoryIds.map(() => '?').join(', ')
  const rows = await env.DB.prepare(
    `SELECT category_id, memory_id FROM memory_categories
     WHERE owner_id = ? AND category_id IN (${placeholders})`,
  )
    .bind(ownerId, ...categoryIds)
    .all<{ category_id: string, memory_id: string }>()
  for (const row of rows.results) {
    const list = members.get(row.category_id) ?? []
    list.push(row.memory_id)
    members.set(row.category_id, list)
  }
  return members
}
