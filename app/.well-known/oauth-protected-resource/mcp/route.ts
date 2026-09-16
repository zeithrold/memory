import type { Env } from '@/lib/server/env'
import { env } from 'cloudflare:workers'
import { protectedResourceResponse } from '@/lib/server/discovery'
import { MCP_RESOURCE_PATH } from '@/lib/server/oauth'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  return protectedResourceResponse(request, env as unknown as Env, MCP_RESOURCE_PATH)
}
export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT,
}
