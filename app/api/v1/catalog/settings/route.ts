import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogSettings, saveCatalogSettings } from '@/lib/server/catalog/api'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ env, principal }) => readCatalogSettings(env, principal.ownerId),
  PUT: async ({ request, env, principal }) =>
    saveCatalogSettings(env, principal.ownerId, await readJson(request)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
