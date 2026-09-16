import type { Env } from '@/lib/server/env'
import { env } from 'cloudflare:workers'
import { api } from '@/lib/server/api'

export const dynamic = 'force-dynamic'
async function handle(request: Request): Promise<Response> {
  return api(request, env as unknown as Env)
}
// Every verb the service layer dispatches on must be re-exported here. The App
// Router answers 405 for a method with no exported handler, so a verb the
// service supports but this module omits never reaches it and no service-level
// test can see that. `tests/api-route.test.ts` guards the list.
export {
  handle as DELETE,
  handle as GET,
  handle as PATCH,
  handle as POST,
  handle as PUT,
}
