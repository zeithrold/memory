import type { Env } from './env'
import { AppError, errorResponse, problemDocument, problemResponse } from './errors'
import { metadataResponse, secureResponse } from './http'
import { protectedResourceMetadata } from './oauth'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
/**
 * RFC 9728 protected resource metadata. Published at the origin root and at the
 * path-insertion location for the MCP endpoint, so a client that treats either
 * the origin or the endpoint URL as the resource identifier finds a matching
 * document.
 */
export function protectedResourceResponse(
  request: Request,
  env: Env,
  resourcePath: string,
): Response {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS })
  const context = {
    origin: env.APP_ORIGIN,
    instance: new URL(request.url).pathname,
    method: request.method,
  }
  if (request.method !== 'GET') {
    return secureResponse(
      problemResponse(
        problemDocument(
          'METHOD_NOT_ALLOWED',
          'OAuth discovery documents are read-only.',
          context,
        ),
        { ...CORS, Allow: 'GET, OPTIONS' },
      ),
    )
  }
  const resource = `${env.APP_ORIGIN.replace(/\/+$/, '')}${resourcePath}`
  const metadata = protectedResourceMetadata(env, resource)
  if (metadata === null) {
    return secureResponse(
      errorResponse(
        new AppError(
          'AUTH_NOT_CONFIGURED',
          'OAuth discovery needs a configured Clerk instance.',
        ),
        context,
      ),
    )
  }
  return metadataResponse(metadata)
}
