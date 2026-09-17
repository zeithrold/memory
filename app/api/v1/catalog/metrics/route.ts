import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogMetrics } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ env, principal }) => readCatalogMetrics(env, principal.ownerId),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
