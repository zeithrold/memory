import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Principal, Scope } from '../contracts'
import type { Env } from './env'
import { z } from 'zod'

import { errorResponse, requirePermission } from './errors'

import { challenge, MCP_RESOURCE_PATH } from './oauth'
import { recordUsage } from './usage'

interface CallMemoryToolContext {
  principal: Principal
  env: Env
}

export async function callMemoryTool(
  context: CallMemoryToolContext,
  name: string,
  scope: Scope,
  run: () => Promise<unknown>,
): Promise<CallToolResult> {
  const { principal, env } = context

  const started = Date.now()
  try {
    requirePermission(principal, scope)
    const result = await run()
    recordUsage(env, principal, { operation: name, status: 200, started })
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(result) },
      ],
      // Every run callback returns an object; the SDK rejects a successful
      // result that does not carry structured content once a tool declares an
      // output schema. The serialized JSON stays in `content` for clients
      // that predate structured content, as the MCP specification suggests.
      structuredContent: z.record(z.string(), z.unknown()).parse(result),
    }
  }
  catch (error) {
    const response = errorResponse(error, {
      origin: env.APP_ORIGIN,
      instance: MCP_RESOURCE_PATH,
      method: 'POST',
    })
    // MCP hosts only surface the account-linking UI when the tool result
    // carries this challenge, and the scope is what makes it actionable.
    const authentication
      = response.status === 403
        ? {
            _meta: {
              'mcp/www_authenticate': [
                challenge(env, {
                  scopes: [scope],
                  error: 'insufficient_scope',
                  description: `This connection needs the ${scope} scope.`,
                }),
              ],
            },
          }
        : {}
    recordUsage(
      env,
      principal,
      { operation: name, status: response.status, started },
    )
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: await response.text() },
      ],
      ...authentication,
    }
  }
}
