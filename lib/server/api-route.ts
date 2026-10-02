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

interface DefineApiRouteOptions { sessionOnly?: boolean, credentialKinds?: CredentialKind[] }

export function defineApiRoute(
  operation: string,
  handlers: Partial<Record<ApiMethod, ApiHandler>>,
  options: DefineApiRouteOptions = {},
): Record<ApiMethod, (request: Request, context?: NextContext) => Promise<Response>> {
  const allow = Object.keys(handlers).join(', ')
  const make = (method: ApiMethod) => async (request: Request, context?: NextContext) => {
    const env = context?.env ?? (await import('cloudflare:workers')).env
    const url = new URL(request.url)
    const started = Date.now()
    let principal: Principal | undefined
    let response: Response
    try {
      await preAuthRateLimit(request, env)
      const handler = handlers[method]
      if (!(handler !== undefined)) {
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
        if ((options.sessionOnly !== undefined && options.sessionOnly === true)) {
          requireSession(principal)
        }
        const params = await routeParams(context)
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
    if ((principal !== undefined)) {
      recordUsage(
        env,
        principal,
        { operation: `${method} ${operation}`, status: response.status, started },
      )
    }
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

async function routeParams(context: NextContext | undefined): Promise<Record<string, string>> {
  const rawParams = await context?.params
  const params = Object.fromEntries(
    Object.entries(rawParams ?? {}).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [
            [key, value],
          ]
        : []),
  )
  return params
}
