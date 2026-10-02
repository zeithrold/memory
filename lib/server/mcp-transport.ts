import type { Env } from './env'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'

import { authenticate, preAuthRateLimit, rateLimit } from './auth'
import { AppError, errorResponse, problemDocument, problemResponse } from './errors'
import { readJson, secureResponse } from './http'
import { createMemoryServer } from './mcp-server'

import { challenge } from './oauth'

/**
 * The pinned MCP SDK implements protocol revisions up to 2025-11-25 and rejects
 * any other `MCP-Protocol-Version` with 400 before dispatch. Newer clients must
 * still be able to reach version negotiation the way `initialize` already does,
 * so an unrecognised version is dropped and the request is served with the
 * revision this server implements.
 */
export function negotiatedRequest(request: Request): Request {
  const version = request.headers.get('mcp-protocol-version')
  if (version === null || SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return request
  }
  const headers = new Headers(request.headers)
  headers.delete('mcp-protocol-version')
  // Built from primitives rather than cloned: the route handler receives a
  // request shim that the workerd Request constructor rejects. The body is read
  // from the original request and handed to the transport as `parsedBody`, so
  // this copy only has to carry the method and headers.
  return new Request(request.url, { method: request.method, headers })
}

export async function mcp(request: Request, env: Env): Promise<Response> {
  const served = negotiatedRequest(request)
  const context = {
    origin: env.APP_ORIGIN,
    instance: new URL(served.url).pathname,
    method: served.method,
  }
  // A CORS preflight never carries credentials, so it is answered first.
  if (served.method === 'OPTIONS') {
    return preflightResponse()
  }
  try {
    await preAuthRateLimit(served, env)
    const principal = await authenticate(served, env, ['personal', 'oauth'])
    await rateLimit(env, principal)
    if (served.method !== 'POST') {
      return secureResponse(
        problemResponse(
          problemDocument(
            'METHOD_NOT_ALLOWED',
            'The MCP endpoint accepts POST requests only.',
            context,
          ),
          { Allow: 'POST' },
        ),
      )
    }
    const body = await readJson(request)
    const server = createMemoryServer(env, principal)
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return secureResponse(
        await transport.handleRequest(served, { parsedBody: body }),
      )
    }
    finally {
      await server.close()
    }
  }
  catch (error) {
    if (
      error instanceof AppError
      && (error.status === 401 || error.status === 403)
    ) {
      return secureResponse(
        errorResponse(error, context),
        challenge(env, {
          scopes: ['memory:read', 'memory:write'],
          ...(error.code === 'INSUFFICIENT_SCOPE'
            ? { error: 'insufficient_scope' }
            : {}),
        }),
      )
    }
    return secureResponse(errorResponse(error, context))
  }
}

function preflightResponse(): Response {
  return secureResponse(new Response(null, { status: 204, headers: { Allow: 'POST' } }))
}
