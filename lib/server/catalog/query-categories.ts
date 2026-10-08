import type { Env } from '../env'
import type { CatalogStateRow, CategoryRow } from './model'
import { AppError } from '../errors'
import {
  loadCategories,
  loadState,
} from './model'

export type CategoryView = {
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

export type CatalogView = {
  version: number
  updatedAt: string | null
  categories: CategoryView[]
  assigned: number
  orphans: number
  skipped: number
  pendingProposals: number
  pendingAdvice: string | null
}

function serializeCategory(category: CategoryRow): CategoryView {
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

export async function getCatalogView(
  env: Env,
  ownerId: string,
): Promise<CatalogView> {
  const [categories, state, pending] = await Promise.all(
    [
      loadCategories(env, ownerId),
      loadState(env, ownerId),
      env.DB.prepare(
        'SELECT count(*) AS n FROM catalog_proposals WHERE owner_id = ? AND status = \'pending\'',
      )
        .bind(

          ownerId,
        )
        .first<{ n: number }>(),
    ],
  )
  const summary = catalogSummary(state)
  return {
    ...summary,
    categories: categories.map(serializeCategory),
    pendingProposals: pending?.n ?? 0,
  }
}

function catalogSummary(
  state: CatalogStateRow | null,
): Omit<CatalogView, 'categories' | 'pendingProposals'> {
  if (state === null) {
    return { version: 1, updatedAt: null, assigned: 0, orphans: 0, skipped: 0, pendingAdvice: null }
  }
  return {
    version: state.version,
    updatedAt: state.last_run_at,
    assigned: state.assigned_count,
    orphans: state.orphan_count,
    skipped: state.skipped_count,
    pendingAdvice: state.pending_advice,
  }
}

const CATEGORY_PAGE_SIZE = 30

export type CategoryDetailView = {
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

type CategoryMemoryRow = {

  id: string
  title: string
  kind: string
  project: string
  is_primary: number
  updated_at: string

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
    .first<CategoryRow>()
  if (category === null) {
    throw new AppError('NOT_FOUND', 'That category does not exist.')
  }

  const [children, totalRow, memories] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM categories
       WHERE owner_id = ? AND parent_id = ? AND state != 'retired'
       ORDER BY slug`,
    )
      .bind(ownerId, categoryId)
      .all<CategoryRow>(),
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
      .all<CategoryMemoryRow>(),
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
