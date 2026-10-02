import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { Scope } from '../contracts'
import { z } from 'zod'
import {
  catalogSchema,
  catalogSearchResultSchema,
  catalogSearchSchema,
  createSchema,
  deleteResultSchema,
  memorySchema,
  searchResultSchema,
  searchSchema,
  updateSchema,
} from '../contracts'

const READ_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
}

const IDEMPOTENT_WRITE: ToolAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
}

const DESTRUCTIVE_WRITE: ToolAnnotations = { destructiveHint: true }

export interface ToolMetadata {
  name: string
  scope: Scope
  description: string
  schema: AnySchema
  /** Advertised output schema; the SDK validates every successful result against it. */
  outputSchema: AnySchema
  annotations: ToolAnnotations
}

// One declaration per tool drives both registration and the advertised tool list,
// so descriptions and schemas cannot drift apart.
export const SEARCH_TOOL = {
  name: 'memory_search',
  scope: 'memory:read',
  description:
    ('Search one project (global by default), optionally within categoryIds '
      + 'returned by memory_catalog_search. A depth-1 category includes its '
      + 'children. Returns short previews; use memory_get for full text. Search '
      + 'global and the current project separately when both are relevant.'),
  schema: searchSchema,
  outputSchema: searchResultSchema,
  annotations: READ_ANNOTATIONS,
} as const satisfies ToolMetadata

export const CATALOG_SEARCH_TOOL = {
  name: 'memory_catalog_search',
  scope: 'memory:read',
  description:
    ('Search the catalog for categories relevant to a broad question. Results and '
      + 'counts are restricted to memories visible in the requested project. Pass '
      + 'chosen category ids to memory_search.categoryIds.'),
  schema: catalogSearchSchema,
  outputSchema: catalogSearchResultSchema,
  annotations: READ_ANNOTATIONS,
} as const satisfies ToolMetadata

export const GET_TOOL = {
  name: 'memory_get',
  scope: 'memory:read',
  description: 'Read a memory and its current version.',
  schema: z.object({ id: z.uuid() }),
  outputSchema: memorySchema,
  annotations: READ_ANNOTATIONS,
} as const satisfies ToolMetadata

export const CREATE_TOOL = {
  name: 'memory_create',
  scope: 'memory:write',
  description:
    ('Save a stable fact with its evidence/source. Generate a UUID idempotencyKey '
      + 'and reuse it only when retrying the identical request. Do not save secrets '
      + 'or unverified claims.'),
  schema: createSchema,
  outputSchema: memorySchema,
  annotations: IDEMPOTENT_WRITE,
} as const satisfies ToolMetadata

export const UPDATE_TOOL = {
  name: 'memory_update',
  scope: 'memory:write',
  description:
    ('Update a verified memory using its expectedVersion; preserves history. On '
      + 'conflict, reread and reconcile instead of blindly retrying.'),
  schema: updateSchema.extend({ id: z.uuid() }),
  outputSchema: memorySchema,
  annotations: DESTRUCTIVE_WRITE,
} as const satisfies ToolMetadata

export const DELETE_TOOL = {
  name: 'memory_delete',
  scope: 'memory:delete',
  description:
    ('Forget a memory only on explicit user instruction. Purges text/history and '
      + 'queues vector deletion. Requires its current version.'),
  schema: z.object({
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
  }),
  outputSchema: deleteResultSchema,
  annotations: DESTRUCTIVE_WRITE,
} as const satisfies ToolMetadata

export const CATALOG_TOOL = {
  name: 'memory_catalog',
  scope: 'memory:read',
  description:
    ('Read the user\'s memory catalog: the two-level taxonomy, what each category '
      + 'holds, and how many memories are still unclassified. Use it to choose which '
      + 'project or topic to search when the query is broad. The taxonomy itself is '
      + 'maintained server-side and is read-only here.'),
  schema: z.object({}).strict(),
  outputSchema: catalogSchema,
  annotations: READ_ANNOTATIONS,
} as const satisfies ToolMetadata

export const TOOLS: readonly ToolMetadata[] = [
  SEARCH_TOOL,
  CATALOG_SEARCH_TOOL,
  GET_TOOL,
  CREATE_TOOL,
  UPDATE_TOOL,
  DELETE_TOOL,
  CATALOG_TOOL,
]
