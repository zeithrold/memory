import { defineApiRoute } from '@/lib/server/api-route'
import { readCatalogRun } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal, params }) => {
    const query = new URL(request.url).searchParams
    return await readCatalogRun(
      env,
      principal.ownerId,
      { rawId: params.id, rawOffset: query.get('offset'), rawLimit: query.get('limit') },
    )
  },
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
