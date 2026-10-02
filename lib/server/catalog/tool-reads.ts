import { z } from 'zod'
import { ftsQuery } from '../search'
import { loadBatchMemories } from './model'
import { categoryIdSchema, defineTool, memoryIdMembership, memoryIdSchema } from './tool-common'

export const catalogOverviewTool = defineTool(
  {
    name: 'catalog_overview',
    description:
    ('Read the shape of the catalog: how many categories and memories it holds, '
      + 'how many memories are still unclassified, and the largest categories. Start '
      + 'here when you are unsure what the catalog looks like.'),
    effect: 'read',
    schema: z.object({}).strict(),
    async run(
      ctx,
    ) {
      const total = await ctx.env.DB.prepare(
        'SELECT count(*) AS n FROM memories WHERE owner_id = ? AND deleted = 0',
      )
        .bind(ctx.ownerId)
        .first<{ n: number }>()
      const classified = await ctx.env.DB.prepare(
        'SELECT count(DISTINCT memory_id) AS n FROM memory_categories WHERE owner_id = ?',
      )
        .bind(ctx.ownerId)
        .first<{ n: number }>()
      const categories = [
        ...ctx.snapshot.categories,
      ]
        .sort((left, right) => right.member_count - left.member_count)
        .slice(0, 10)
        .map(

          category => ({ id: category.id, label: category.label, members: category.member_count }),
        )
      return {
        result: {
          categories: ctx.snapshot.categories.length,
          topLevel: ctx.snapshot.categories.filter(category => category.depth === 1).length,
          memories: total?.n ?? 0,
          unclassified: Math.max(0, (total?.n ?? 0) - (classified?.n ?? 0)),
          largestCategories: categories,
        },
      }
    },
  },
)

export const catalogListTool = defineTool({
  name: 'catalog_list',
  description:
    ('List categories with the description and boundary that define them. Read '
      + 'this before assigning, because an unknown category id is refused.'),
  effect: 'read',
  schema: z.object({ parentId: categoryIdSchema.nullable().optional() }).strict(),
  run(ctx, input) {
    const parentId = input.parentId ?? null
    const rows = ctx.snapshot.categories
      .filter(category => category.parent_id === parentId)
      .map(category => ({
        id: category.id,
        slug: category.slug,
        label: category.label,
        description: category.description,
        boundary: category.boundary,
        members: category.member_count,
        depth: category.depth,
      }))
    return { result: { categories: rows } }
  },
})

export const catalogMembersTool = defineTool(
  {
    name: 'catalog_members',
    description:
    ('List memories currently inside a category, to judge whether a memory '
      + 'belongs there or whether two categories overlap.'),
    effect: 'read',
    schema: z.object({ categoryId: categoryIdSchema, limit: z.number().int().min(1).max(50).optional() })
      .strict(),
    async run(ctx, input) {
      const rows = await ctx.env.DB.prepare(
        `SELECT m.id, m.title, m.kind, m.project
       FROM memory_categories mc JOIN memories m ON m.id = mc.memory_id
       WHERE mc.category_id = ? AND mc.owner_id = ? AND m.deleted = 0
       ORDER BY mc.is_primary DESC, m.updated_at DESC LIMIT ?`,
      )
        .bind(input.categoryId, ctx.ownerId, input.limit ?? 20)
        .all<{ id: string, title: string, kind: string, project: string }>()
      return { result: { memories: rows.results } }
    },
  },
)

export const batchListTool = defineTool(
  {
    name: 'batch_list',
    description: 'List the memories waiting in this batch, with their current categories.',
    effect: 'read',
    schema: z.object({}).strict(),
    run(
      ctx,
    ) {
      return {
        result: {
          memories: ctx.snapshot.memories.map(
            memory => ({
              id: memory.id,
              title: memory.title,
              kind: memory.kind,
              tags: memory.tags,
              project: memory.project,
              categories: (ctx.snapshot.memberships.get(memory.id,
              ) ?? []).map(row => row.category_id),
            }),
          ),
        },
      }
    },
  },
)

export const memoryLookupTool = defineTool(
  {
    name: 'memory_lookup',
    description: 'Read one memory from this batch in full before deciding where it belongs.',
    effect: 'read',
    schema: z.object({ memoryId: memoryIdSchema }).strict(),
    async run(
      ctx,
      input,
    ) {
      const verdict = memoryIdMembership(ctx, input.memoryId)
      if (verdict !== null) {
        return { result: { ok: false, rejected: true, reason: verdict } }
      }
      const [memory] = await loadBatchMemories(ctx.env, ctx.ownerId, [input.memoryId], ctx.includeContent)
      if (memory === undefined) {
        return { result: { ok: false, reason: 'That memory is no longer available.' } }
      }
      return {
        result: {
          memory: {
            id: memory.id,
            title: memory.title,
            kind: memory.kind,
            tags: memory.tags,
            project: memory.project,
            ...(memory.content === undefined ? {} : { content: memory.content }),
            categories: (ctx.snapshot.memberships.get(memory.id) ?? []).map(row => row.category_id),
          },
        },
      }
    },
  },
)

export const memorySearchTool = defineTool({
  name: 'memory_search',
  description:
    ('Search the account\'s memories by keyword to check whether a near-duplicate '
      + 'category already exists. Keyword only: semantic search is unavailable '
      + 'inside a maintenance run.'),
  effect: 'read',
  optional: true,
  schema: z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  async run(ctx, input) {
    // Reuses the service's own tokeniser, which adds CJK unigrams and bigrams
    // that SQLite's unicode61 tokeniser would otherwise miss.
    const query = ftsQuery(input.query)
    if (query.length === 0) {
      return { result: { memories: [] } }
    }
    const rows = await ctx.env.DB.prepare(
      `SELECT m.id, m.title, m.kind, m.project
       FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid
       WHERE memories_fts MATCH ? AND m.owner_id = ? AND m.deleted = 0
       ORDER BY bm25(memories_fts) LIMIT ?`,
    )
      .bind(query, ctx.ownerId, input.limit ?? 10)
      .all<{ id: string, title: string, kind: string, project: string }>()
    return { result: { memories: rows.results } }
  },
})
