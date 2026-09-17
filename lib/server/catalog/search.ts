import type { Principal } from '../../contracts'
import type { Env } from '../env'
import { catalogSearchSchema } from '../../contracts'
import { requirePermission } from '../errors'
import { terms } from '../search'
import { scoreCategories } from './balance'

interface CatalogSearchRow {
  id: string
  parent_id: string | null
  depth: number
  slug: string
  label: string
  description: string
  boundary: string
  parent_slug: string | null
  parent_label: string | null
  visible_member_count: number
}

export interface CatalogSearchCategory {
  id: string
  parentId: string | null
  depth: number
  slug: string
  label: string
  description: string
  boundary: string
  path: { id: string, slug: string, label: string }[]
  visibleMemberCount: number
}

/**
 * Search the taxonomy without injecting the account-wide catalog into model
 * context. Counts and even category visibility are derived only from memories
 * the principal may read in the requested project.
 */
export async function searchCatalog(
  env: Env,
  principal: Principal,
  value: unknown,
): Promise<{ project: string, categories: CatalogSearchCategory[] }> {
  const input = catalogSearchSchema.parse(value)
  requirePermission(principal, 'memory:read', input.project)
  const rows = await env.DB.prepare(
    `SELECT c.id, c.parent_id, c.depth, c.slug, c.label, c.description, c.boundary,
            p.slug AS parent_slug, p.label AS parent_label,
            (SELECT count(DISTINCT mc.memory_id)
             FROM memory_categories mc
             JOIN categories assigned ON assigned.id = mc.category_id
             JOIN memories m ON m.id = mc.memory_id
             WHERE mc.owner_id = c.owner_id
               AND assigned.owner_id = c.owner_id
               AND (assigned.id = c.id OR assigned.parent_id = c.id)
               AND m.owner_id = c.owner_id
               AND m.project = ?
               AND m.deleted = 0) AS visible_member_count
     FROM categories c
     LEFT JOIN categories p ON p.id = c.parent_id AND p.owner_id = c.owner_id
     WHERE c.owner_id = ? AND c.state = 'active'`,
  )
    .bind(input.project, principal.ownerId)
    .all<CatalogSearchRow>()
  const visible = rows.results.filter(row => row.visible_member_count > 0)
  const scores = scoreCategories(
    visible.map(row => ({
      id: row.id,
      label: row.label,
      description: row.description,
      boundary: row.boundary,
      member_count: row.visible_member_count,
    })),
    terms(input.query),
  )
  const categories = visible
    .filter(row => scores.has(row.id))
    .sort((left, right) =>
      (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0)
      || right.visible_member_count - left.visible_member_count
      || left.label.localeCompare(right.label),
    )
    .slice(0, input.limit)
    .map(row => ({
      id: row.id,
      parentId: row.parent_id,
      depth: row.depth,
      slug: row.slug,
      label: row.label,
      description: row.description,
      boundary: row.boundary,
      path: row.parent_id === null
        ? [{ id: row.id, slug: row.slug, label: row.label }]
        : [
            { id: row.parent_id, slug: row.parent_slug ?? '', label: row.parent_label ?? '' },
            { id: row.id, slug: row.slug, label: row.label },
          ],
      visibleMemberCount: row.visible_member_count,
    }))
  return { project: input.project, categories }
}
