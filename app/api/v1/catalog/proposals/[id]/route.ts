import { defineApiRoute } from '@/lib/server/api-route'
import { decideCatalogProposal } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  POST: async ({ request, env, principal, params }) =>
    decideCatalogProposal(env, principal, params.id, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
