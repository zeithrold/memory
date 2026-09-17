import { defineApiRoute } from '@/lib/server/api-route'
import { testCatalogSettings } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  POST: async ({ request, env, principal }) =>
    testCatalogSettings(env, principal.ownerId, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
