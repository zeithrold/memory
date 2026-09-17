import { z } from 'zod'
import { projectSchema } from '@/lib/contracts'
import { defineApiRoute } from '@/lib/server/api-route'
import { readJson } from '@/lib/server/http'
import { createMemory, listMemories } from '@/lib/server/memories'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('memories', {
  GET: async ({ request, env, principal }) => {
    const query = new URL(request.url).searchParams
    return Response.json({
      memories: await listMemories(
        env,
        principal,
        projectSchema.parse(query.get('project') ?? 'global'),
        z.coerce.number().int().min(0).max(100000).parse(query.get('offset') ?? 0),
      ),
    })
  },
  POST: async ({ request, env, principal }) =>
    Response.json(await createMemory(env, principal, await readJson(request)), { status: 201 }),
})
export const { GET, POST, PUT, PATCH, DELETE } = route
