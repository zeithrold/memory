import { z } from 'zod'
import { defineApiRoute } from '@/lib/server/api-route'
import { readJson } from '@/lib/server/http'
import { deleteMemory, getMemory, updateMemory } from '@/lib/server/memories'

export const dynamic = 'force-dynamic'
const id = (params: Record<string, string>) => z.string().uuid().parse(params.id)
const route = defineApiRoute('memories', {
  GET: async ({ env, principal, params }) => Response.json(await getMemory(env, principal, id(params))),
  PATCH: async ({ request, env, principal, params }) =>
    Response.json(await updateMemory(env, principal, id(params), await readJson(request))),
  DELETE: async ({ request, env, principal, params }) => {
    const input = z.object({ expectedVersion: z.number().int().positive() }).strict().parse(await readJson(request))
    await deleteMemory(env, principal, id(params), input.expectedVersion)
    return new Response(null, { status: 204 })
  },
})
export const { GET, POST, PUT, PATCH, DELETE } = route
