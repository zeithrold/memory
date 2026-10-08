import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import type { Principal, Scope } from '../contracts'
import type { Env } from './env'
import type * as McpTools from './mcp-metadata'

import { getCatalogView } from './catalog/query'
import { searchCatalog } from './catalog/search'
import { AppError } from './errors'
import { callMemoryTool } from './mcp-call'
import {
  CATALOG_SEARCH_TOOL,
  CATALOG_TOOL,
  CREATE_TOOL,
  DELETE_TOOL,
  GET_TOOL,
  SEARCH_TOOL,
  UPDATE_TOOL,
} from './mcp-metadata'
import {
  createMemory,
  deleteMemory,
  getMemory,
  searchMemories,
  updateMemory,
} from './memories'

export function registerMemoryTools(
  server: McpServer,
  env: Env,
  principal: Principal,
): void {
  const run = async (
    name: string,
    scope: Scope,
    operation: () => Promise<unknown>,
  ) => await callMemoryTool({ env, principal }, name, scope, operation)
  registerMemoryTool({ server, env, principal }, SEARCH_TOOL, async input =>
    await run(SEARCH_TOOL.name, SEARCH_TOOL.scope, async () => {
      const result = await searchMemories(env, principal, input)
      return {
        ...result,
        memories: result.memories.map(memory => ({
          ...memory,
          content: memory.content.slice(0, 500),
        })),
      }
    }))
  registerMemoryTool({ server, env, principal }, CATALOG_SEARCH_TOOL, async input =>
    await run(CATALOG_SEARCH_TOOL.name, CATALOG_SEARCH_TOOL.scope, async () =>
      await searchCatalog(env, principal, input)))
  registerMemoryTool({ server, env, principal }, GET_TOOL, async input =>
    await run(GET_TOOL.name, GET_TOOL.scope, async () =>
      await getMemory(env, principal, input.id)))
  registerMemoryTool({ server, env, principal }, CREATE_TOOL, async input =>
    await run(CREATE_TOOL.name, CREATE_TOOL.scope, async () =>
      await createMemory(env, principal, input)))
  registerMemoryTool({ server, env, principal }, UPDATE_TOOL, async ({ id, ...input }) =>
    await run(UPDATE_TOOL.name, UPDATE_TOOL.scope, async () =>
      await updateMemory(env, principal, id, input)))
  registerMemoryTool({ server, env, principal }, DELETE_TOOL, async input =>
    await run(DELETE_TOOL.name, DELETE_TOOL.scope, async () => {
      await deleteMemory(env, principal, input.id, input.expectedVersion)
      return { deleted: true }
    }))
  registerMemoryTool(
    { server, env, principal },
    CATALOG_TOOL,
    async () =>
      await run(
        CATALOG_TOOL.name,
        CATALOG_TOOL.scope,
        async () => {
          if (principal.project !== null) {
            throw new AppError(

              'FORBIDDEN',

              'A project-restricted credential cannot read the account-wide catalog. '
              + 'Use memory_catalog_search instead.',

            )
          }
          return await getCatalogView(env, principal.ownerId)
        },
      ),
  )
}

type RegisterContext = { server: McpServer, env: Env, principal: Principal }

function registerMemoryTool<S extends z.ZodObject>(
  context: RegisterContext,
  metadata: McpTools.ToolMetadata & { schema: S },
  operation: (input: z.output<S>) => ReturnType<typeof callMemoryTool>,
): void {
  const { server } = context
  const inputSchema: z.ZodObject = metadata.schema
  server.registerTool(
    metadata.name,
    {
      description: metadata.description,
      inputSchema,
      outputSchema: metadata.outputSchema,
      annotations: metadata.annotations,
    },
    async (input: unknown) => await operation(metadata.schema.parse(input)),
  )
}
