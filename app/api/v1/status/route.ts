import { getStatus } from '@/lib/server/account'
import { defineApiRoute } from '@/lib/server/api-route'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('status', {
  GET: async ({ env, principal }) => getStatus(env, principal),
}, { credentialKinds: ['session', 'personal', 'oauth'] })
export const { GET, POST, PUT, PATCH, DELETE } = route
