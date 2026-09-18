import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogRuns, startCatalogRun } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal }) => {
    const query = new URL(request.url).searchParams
    return readCatalogRuns(
      env,
      principal.ownerId,
      query.get('limit'),
      query.get('offset'),
    )
  },
  POST: async ({ request, env, principal }) =>
    startCatalogRun(env, principal.ownerId, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
