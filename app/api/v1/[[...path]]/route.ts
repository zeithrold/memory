import type { Env } from '@/lib/server/env'
import { env } from 'cloudflare:workers'
import { api } from '@/lib/server/api'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  return api(request, env as unknown as Env)
}
export { handle as DELETE, handle as GET, handle as PATCH, handle as POST }
