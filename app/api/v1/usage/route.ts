import { defineApiRoute } from '@/lib/server/api-route'
import { getUsage } from '@/lib/server/usage'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('usage', {
  GET: async ({ env, principal }) => Response.json(await getUsage(env, principal.ownerId)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
