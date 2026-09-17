import { z } from 'zod'

export const scopeSchema = z.enum([
  'memory:read',
  'memory:write',
  'memory:delete',
])
export const projectSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w.-]+$/)
export const memoryInputSchema = z
  .object({
    project: projectSchema.default('global'),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(6000),
    kind: z.enum(['preference', 'fact', 'decision', 'experience']),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    source: z.string().trim().min(1).max(1000),
  })
  .strict()
export const createSchema = memoryInputSchema.extend({
  idempotencyKey: z.string().uuid(),
})
export const updateSchema = memoryInputSchema.extend({
  expectedVersion: z.number().int().positive(),
})
/**
 * Search is flat by default. `mode: 'catalog'` additionally routes through the
 * catalog so a large category cannot crowd out a small one; the flat ranking is
 * always fused in, because measured router precision is poor enough that a
 * routing miss must degrade to today's behaviour rather than to nothing.
 */
export const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(300),
    project: projectSchema.default('global'),
    limit: z.number().int().min(1).max(20).default(8),
    /**
     * Explicit catalog scope. A depth-1 category includes its depth-2
     * children; a depth-2 category includes only itself.
     */
    categoryIds: z.array(z.string().uuid()).min(1).max(5).optional(),
    mode: z.enum(['flat', 'catalog']).default('flat'),
    /** Only consulted when `mode` is `catalog`. */
    balance: z.enum(['equal', 'sqrt', 'neyman']).default('sqrt'),
  })
  .strict()

export const catalogSearchSchema = z
  .object({
    query: z.string().trim().min(1).max(300),
    project: projectSchema.default('global'),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .strict()
export const tokenInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(scopeSchema).min(1).max(3),
    project: projectSchema.nullable().default(null),
    expiresInDays: z.number().int().min(1).max(365).default(90),
  })
  .strict()
/**
 * The stored memory as `serialize()` emits it. Strict so a field added to the
 * row shape without updating this schema fails a test rather than a tool call.
 */
export const memorySchema = memoryInputSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const searchResultSchema = z.object({
  memories: z.array(memorySchema),
  mode: z.enum(['hybrid', 'keyword']),
  degraded: z.boolean(),
  /** How the query was routed, so a caller can see a catalog miss. */
  catalog: z
    .object({
      routed: z.boolean(),
      balance: z.enum(['equal', 'sqrt', 'neyman']),
      categories: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          candidates: z.number().int(),
        }),
      ),
    })
    .nullable(),
})

export const catalogSearchCategorySchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  depth: z.number().int(),
  slug: z.string(),
  label: z.string(),
  description: z.string(),
  boundary: z.string(),
  path: z.array(
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      label: z.string(),
    }),
  ),
  visibleMemberCount: z.number().int(),
})
export const catalogSearchResultSchema = z.object({
  project: projectSchema,
  categories: z.array(catalogSearchCategorySchema),
})

/**
 * The account-wide catalog snapshot used by the UI and legacy browsing tool.
 * Normal agent retrieval searches category metadata with catalogSearchSchema
 * instead of injecting this whole structure into model context.
 */
export const catalogCategorySchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  depth: z.number().int(),
  slug: z.string(),
  label: z.string(),
  description: z.string(),
  boundary: z.string(),
  memberCount: z.number().int(),
  state: z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
})
export const catalogSchema = z.object({
  version: z.number().int(),
  updatedAt: z.string().nullable(),
  categories: z.array(catalogCategorySchema),
  assigned: z.number().int(),
  orphans: z.number().int(),
  skipped: z.number().int(),
  pendingProposals: z.number().int(),
})
export const deleteResultSchema = z.object({ deleted: z.boolean() })
export type Scope = z.infer<typeof scopeSchema>
export type MemoryInput = z.infer<typeof memoryInputSchema>
export type Memory = z.infer<typeof memorySchema>
export interface MemoryRevision {
  version: number
  title: string
  content: string
  kind: MemoryInput['kind']
  tags: string
  source: string
  created_at: string
}
export interface Principal {
  ownerId: string
  tokenId: string | null
  scopes: Scope[]
  project: string | null
  /** OAuth client identifier, recorded for usage attribution only. */
  clientId?: string
}
export interface TokenSummary {
  id: string
  name: string
  prefix: string
  scopes: Scope[]
  project: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}
export interface UsageSummary {
  operation: string
  calls: number
  errors: number
  average_ms: number
  day: string
  token_id: string | null
  token_name: string | null
  client_id: string | null
}
