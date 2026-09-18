import { defineApiRoute } from '@/lib/server/api-route'
import { decideCatalogProposals, readCatalogProposals } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal }) => readCatalogProposals(
    env,
    principal.ownerId,
    new URL(request.url).searchParams.get('status'),
  ),
  POST: async ({ request, env, principal }) =>
    decideCatalogProposals(env, principal, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
