import { env } from 'cloudflare:workers'
import { mcp } from '@/lib/server/mcp'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  return await mcp(request, env)
}
// Every method is exported so this handler, not a framework fallback, decides the
// response: only POST is accepted and anything else answers with a problem document.
export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT,
}
