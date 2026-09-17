import { defineApiRoute } from '@/lib/server/api-route'
import { undoCatalogRun } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  POST: async ({ env, principal, params }) => undoCatalogRun(env, principal.ownerId, params.id),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
