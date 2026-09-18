import { defineApiRoute } from '@/lib/server/api-route'
import { readCategory } from '@/lib/server/catalog/api'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('catalog', {
  GET: async ({ request, env, principal, params }) =>
    readCategory(
      env,
      principal.ownerId,
      params.id,
      new URL(request.url).searchParams.get('offset'),
    ),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
