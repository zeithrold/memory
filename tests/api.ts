import type { Env } from '../lib/server/env'
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

type Route = Record<string, unknown>
type Handler = (request: Request, context: { env: Env, params: Promise<Record<string, string>> }) => Promise<Response>

export async function api(request: Request, env: Env): Promise<Response> {
  const segments = new URL(request.url).pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean)
  let route: Route | undefined
  let params: Record<string, string> = {}
  const [resource, id, action] = segments
  if (resource === 'memories' && id === undefined)
    route = memories
  else if (resource === 'memories' && id !== undefined && action === 'history')
    [route, params] = [history, { id }]
  else if (resource === 'memories' && id !== undefined)
    [route, params] = [memory, { id }]
  else if (resource === 'search')
    route = search
  else if (resource === 'tokens' && id !== undefined)
    [route, params] = [token, { id }]
  else if (resource === 'tokens')
    route = tokens
  else if (resource === 'usage')
    route = usage
  else if (resource === 'status')
    route = status
  else if (resource === 'catalog' && id === undefined)
    route = catalog
  else if (resource === 'catalog' && id === 'search')
    route = catalogSearch
  else if (resource === 'catalog' && id === 'settings' && action === 'test')
    route = settingsTest
  else if (resource === 'catalog' && id === 'settings')
    route = settings
  else if (resource === 'catalog' && id === 'metrics')
    route = catalogMetrics
  else if (resource === 'catalog' && id === 'runs' && action !== undefined && segments[3] === 'revert')
    [route, params] = [revert, { id: action }]
  else if (resource === 'catalog' && id === 'runs' && action !== undefined)
    [route, params] = [run, { id: action }]
  else if (resource === 'catalog' && id === 'runs')
    route = runs
  else if (resource === 'catalog' && id === 'proposals' && action !== undefined)
    [route, params] = [proposal, { id: action }]
  else if (resource === 'catalog' && id === 'proposals')
    route = proposals
  if (!route)
    throw new Error(`No explicit test route for ${new URL(request.url).pathname}`)
  const handler = route[request.method] as Handler | undefined
  if (!handler)
    throw new Error(`Route does not export ${request.method}`)
  return handler(request, { env, params: Promise.resolve(params) })
}
