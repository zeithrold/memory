import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogRuns, startCatalogRun } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal }) =>
    readCatalogRuns(env, principal.ownerId, new URL(request.url).searchParams.get('limit')),
  POST: async ({ request, env, principal }) =>
    startCatalogRun(env, principal.ownerId, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
