import { z } from 'zod'
import { defineApiRoute } from '@/lib/server/api-route'
import { history } from '@/lib/server/memories'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('memories/history', {
  GET: async ({ env, principal, params }) => Response.json({
    revisions: await history(env, principal, z.string().uuid().parse(params.id)),
  }),
})
export const { GET, POST, PUT, PATCH, DELETE } = route
