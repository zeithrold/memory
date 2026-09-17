import { z } from 'zod'
import { revokeToken } from '@/lib/server/account'
import { defineApiRoute } from '@/lib/server/api-route'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('tokens', {
  DELETE: async ({ env, principal, params }) =>
    revokeToken(env, principal.ownerId, z.string().uuid().parse(params.id)),
}, { sessionOnly: true })
export const { GET, POST, PUT, PATCH, DELETE } = route
