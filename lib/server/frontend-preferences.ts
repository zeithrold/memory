import type { FrontendBootstrap } from '../frontend-preferences'
import { headers } from 'next/headers'
import { memoryFrontendBootstrap } from '../frontend-preferences'

export async function readFrontendBootstrap(): Promise<FrontendBootstrap> {
  const requestHeaders = await headers()
  const { env } = await import('cloudflare:workers')
  return memoryFrontendBootstrap(
    env.APP_ORIGIN,
    requestHeaders.get('cookie') ?? '',
    requestHeaders.get('accept-language') ?? undefined,
  )
}
