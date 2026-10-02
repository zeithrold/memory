import { env } from 'cloudflare:workers'
import { protectedResourceResponse } from '@/lib/server/discovery'

export const dynamic = 'force-dynamic'
function handle(request: Request): Response {
  return protectedResourceResponse(request, env, '')
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
