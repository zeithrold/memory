import type { ApiMethod } from '../lib/server/api-route'
import type { Env } from '../lib/server/env'
import * as category from '../app/api/v1/catalog/categories/[id]/route'
import * as catalogMetrics from '../app/api/v1/catalog/metrics/route'
import * as proposal from '../app/api/v1/catalog/proposals/[id]/route'
import * as proposals from '../app/api/v1/catalog/proposals/route'
import * as catalog from '../app/api/v1/catalog/route'
import * as revert from '../app/api/v1/catalog/runs/[id]/revert/route'
import * as run from '../app/api/v1/catalog/runs/[id]/route'
import * as runs from '../app/api/v1/catalog/runs/route'
import * as catalogSearch from '../app/api/v1/catalog/search/route'
import * as settings from '../app/api/v1/catalog/settings/route'
import * as settingsTest from '../app/api/v1/catalog/settings/test/route'
import * as history from '../app/api/v1/memories/[id]/history/route'
import * as memory from '../app/api/v1/memories/[id]/route'
import * as memories from '../app/api/v1/memories/route'
import * as search from '../app/api/v1/search/route'
import * as status from '../app/api/v1/status/route'
import * as token from '../app/api/v1/tokens/[id]/route'
import * as tokens from '../app/api/v1/tokens/route'
import * as usage from '../app/api/v1/usage/route'

type Handler = (
  request: Request,
  context?: { env?: Env, params?: Promise<Record<string, string>> },
) => Promise<Response>
type Route = Partial<Record<ApiMethod, Handler>>
interface Match { route: Route, params: Record<string, string> }
const collections: Record<string, Route> = { memories, search, tokens, usage, status }
const catalogCollections: Record<string, Route> = {
  search: catalogSearch,
  settings,
  metrics: catalogMetrics,
  runs,
  proposals,
}

function catalogRoute(segments: string[]): Match | undefined {
  const [, resource, id, action] = segments
  if (resource === undefined) {
    return { route: catalog, params: {} }
  }
  if (resource === 'settings' && id === 'test') {
    return { route: settingsTest, params: {} }
  }
  if (id !== undefined) {
    if (resource === 'categories') {
      return { route: category, params: { id } }
    }
    if (resource === 'runs') {
      return { route: action === 'revert' ? revert : run, params: { id } }
    }
    if (resource === 'proposals') {
      return { route: proposal, params: { id } }
    }
  }
  const route = catalogCollections[resource]
  return route === undefined ? undefined : { route, params: {} }
}

function matchRoute(segments: string[]): Match | undefined {
  const [resource, id, action] = segments
  if (resource === undefined) {
    return undefined
  }
  if (resource === 'catalog') {
    return catalogRoute(segments)
  }
  if (resource === 'memories' && id !== undefined) {
    return { route: action === 'history' ? history : memory, params: { id } }
  }
  if (resource === 'tokens' && id !== undefined) {
    return { route: token, params: { id } }
  }
  const route = collections[resource]
  return route === undefined ? undefined : { route, params: {} }
}

export async function api(request: Request, env: Env): Promise<Response> {
  const pathname = new URL(request.url).pathname
  const segments = pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean)
  const match = matchRoute(segments)
  if (match === undefined) {
    throw new Error(`No explicit test route for ${pathname}`)
  }
  if (!apiMethod(request.method)) {
    throw new Error(`Route does not export ${request.method}`)
  }
  const handler = match.route[request.method]
  if (handler === undefined) {
    throw new Error(`Route does not export ${request.method}`)
  }
  return await handler(request, { env, params: Promise.resolve(match.params) })
}

const apiMethods: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
])
function apiMethod(value: string): value is ApiMethod {
  return apiMethods.has(value)
}
