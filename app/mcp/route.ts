import type { Env } from '@/lib/server/env'
import { env } from 'cloudflare:workers'
import { mcp } from '@/lib/server/mcp'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  return mcp(request, env as unknown as Env)
}
export { handle as DELETE, handle as GET, handle as POST }
