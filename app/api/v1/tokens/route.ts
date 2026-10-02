import { createToken, listTokens } from '@/lib/server/account'
import { defineApiRoute } from '@/lib/server/api-route'
import { readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'
const route = defineApiRoute(
  'tokens',
  {
    GET: async ({ env, principal }) => await listTokens(env, principal.ownerId),
    POST: async (
      { request, env, principal },
    ) => await createToken(env, principal, await readJson(request)),
  },
  { sessionOnly: true },
)
export const { GET, POST, PUT, PATCH, DELETE } = route
