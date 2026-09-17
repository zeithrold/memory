import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogRun } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ env, principal, params }) => readCatalogRun(env, principal.ownerId, params.id),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
