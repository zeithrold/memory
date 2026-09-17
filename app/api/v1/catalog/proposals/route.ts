import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogProposals } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal }) => readCatalogProposals(
    env,
    principal.ownerId,
    new URL(request.url).searchParams.get('status'),
  ),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
