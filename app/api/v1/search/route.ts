import { defineApiRoute } from '@/lib/server/api-route'
import { readJson } from '@/lib/server/http'
import { searchMemories } from '@/lib/server/memories'

export const dynamic = 'force-dynamic'
const route = defineApiRoute('search', {
  POST: async ({ request, env, principal }) => Response.json(
    await searchMemories(env, principal, await readJson(request)),
  ),
})
export const { GET, POST, PUT, PATCH, DELETE } = route
