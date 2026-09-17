import { defineApiRoute } from '@/lib/server/api-route'
import { searchCatalog } from '@/lib/server/catalog/search'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog/search', {
  POST: async ({ request, env, principal }) => Response.json(
    await searchCatalog(env, principal, await readJson(request)),
  ),
})
export const { GET, POST, PUT, PATCH, DELETE } = route
