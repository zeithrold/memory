import type { Principal } from '../contracts'
import type { CredentialKind } from './auth'
import type { Env } from './env'
import { authenticate, preAuthRateLimit, rateLimit, requireSession } from './auth'
import { errorResponse, problemDocument, problemResponse } from './errors'
import { secureResponse } from './http'
import { recordUsage } from './usage'

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export interface ApiRouteContext {
  request: Request
  env: Env
  principal: Principal
  params: Record<string, string>
}
type ApiHandler = (context: ApiRouteContext) => Promise<Response>
interface NextContext {
  params?: Promise<Record<string, string | string[] | undefined>>
  /** Test adapters may inject a binding set; Next only supplies params. */
  env?: Env
}

export function defineApiRoute(
  operation: string,
  handlers: Partial<Record<ApiMethod, ApiHandler>>,
  options: { sessionOnly?: boolean, credentialKinds?: CredentialKind[] } = {},
): Record<ApiMethod, (request: Request, context?: NextContext) => Promise<Response>> {
  const allow = (Object.keys(handlers) as ApiMethod[]).join(', ')
  const make = (method: ApiMethod) => async (request: Request, context?: NextContext) => {
    const env = context?.env ?? (await import('cloudflare:workers')).env as unknown as Env
    const url = new URL(request.url)
    const started = Date.now()
    let principal: Principal | undefined
    let response: Response
    try {
      await preAuthRateLimit(request, env)
      const handler = handlers[method]
      if (!handler) {
        response = problemResponse(
          problemDocument('METHOD_NOT_ALLOWED', `This endpoint accepts ${allow}.`, {
            origin: env.APP_ORIGIN,
            instance: url.pathname,
            method,
          }),
          { Allow: allow },
        )
      }
      else {
        principal = await authenticate(request, env, options.credentialKinds)
        await rateLimit(env, principal)
        if (options.sessionOnly)
          requireSession(principal)
        const rawParams = await context?.params
        const params = Object.fromEntries(
          Object.entries(rawParams ?? {}).flatMap(([key, value]) =>
            typeof value === 'string' ? [[key, value]] : []),
        )
        response = await handler({ request, env, principal, params })
      }
    }
    catch (error) {
      response = errorResponse(error, {
        origin: env.APP_ORIGIN,
        instance: url.pathname,
        method,
      })
    }
    if (principal)
      recordUsage(env, principal, `${method} ${operation}`, response.status, started)
    return secureResponse(response)
  }
  return {
    GET: make('GET'),
    POST: make('POST'),
    PUT: make('PUT'),
    PATCH: make('PATCH'),
    DELETE: make('DELETE'),
  }
}
