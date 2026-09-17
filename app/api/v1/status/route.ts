import { getStatus } from '@/lib/server/account'
import { defineApiRoute } from '@/lib/server/api-route'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('status', {
  GET: async ({ env, principal }) => getStatus(env, principal.ownerId),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
