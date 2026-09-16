import type { Principal, Scope } from '../contracts'
import type { Env } from './env'
import { createClerkClient } from '@clerk/backend'
import { AppError } from './errors'

// The MCP authorization contract expects an OAuth 2.1 authorization server. Clerk
// is that server; this module only implements the resource-server half: discovery
// metadata, the WWW-Authenticate challenge, and mapping a verified OAuth token
// onto the same Principal the personal-token path produces.
export const OAUTH_SCOPES = [
  'memory:read',
  'memory:write',
  'memory:delete',
] as const satisfies readonly Scope[]

export const MCP_RESOURCE_PATH = '/mcp'
export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource'

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: string[]
}
export type ToolSecurityScheme
  = | { type: 'noauth' }
    | { type: 'oauth2', scopes: Scope[] }

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, '')
}
/**
 * The publishable key is `pk_(test|live)_<base64(frontendApi + '$')>`.
 * The same expression is already inlined for the server component in `app/page.tsx`.
 */
export function issuerFromPublishableKey(key: string): string | null {
  const encoded = /^pk_(?:test|live)_(.+)$/.exec(key.trim())?.[1]
  if (encoded === undefined)
    return null
  try {
    const decoded = atob(encoded)
    const host = decoded.endsWith('$') ? decoded.slice(0, -1) : decoded
    if (!/^[\w.-]+$/.test(host) || !host.includes('.'))
      return null
    return `https://${host}`
  }
  catch {
    return null
  }
}
/** Only the explicit override and the publishable key matter here. */
export function clerkIssuer(env: Pick<Env, 'CLERK_ISSUER'>): string | null {
  const explicit = env.CLERK_ISSUER?.trim()
  if (explicit !== undefined && explicit.length > 0)
    return trimOrigin(explicit)
  // Vite replaces the global expression; importing node:process prevents it.
  // eslint-disable-next-line node/prefer-global/process
  return issuerFromPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '')
}
export function resourceMetadataUrl(env: Env): string {
  return `${trimOrigin(env.APP_ORIGIN)}${PROTECTED_RESOURCE_PATH}`
}
export function protectedResourceMetadata(
  env: Env,
  resource: string,
): ProtectedResourceMetadata | null {
  const issuer = clerkIssuer(env)
  if (issuer === null)
    return null
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
  }
}
/** RFC 9728 challenge that lets an unauthenticated client discover the metadata. */
export function challenge(
  env: Env,
  options: {
    scopes?: readonly Scope[]
    error?: string
    description?: string
  } = {},
): string {
  const clean = (value: string) =>
    value.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim()
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl(env)}"`]
  if (options.scopes && options.scopes.length > 0)
    parts.push(`scope="${options.scopes.join(' ')}"`)
  if (options.error !== undefined && options.error.length > 0)
    parts.push(`error="${clean(options.error)}"`)
  if (options.description !== undefined && options.description.length > 0)
    parts.push(`error_description="${clean(options.description)}"`)
  return parts.join(', ')
}
/** Every tool requires at least one scope, so every scheme is `oauth2`. */
export function securitySchemesFor(scope: Scope): ToolSecurityScheme[] {
  return [{ type: 'oauth2', scopes: [scope] }]
}
export function mapOauthScopes(scopes: readonly string[]): Scope[] {
  return OAUTH_SCOPES.filter(scope => scopes.includes(scope))
}
export function oauthPrincipal(identity: {
  userId: string | null
  clientId: string | null
  scopes: readonly string[]
}): Principal {
  const scopes = mapOauthScopes(identity.scopes)
  if (identity.userId === null || scopes.length === 0) {
    throw new AppError('INSUFFICIENT_SCOPE', 'This connection is not authorized for any memory scope.')
  }
  return {
    ownerId: identity.userId,
    tokenId: null,
    scopes,
    project: null,
    ...(identity.clientId === null ? {} : { clientId: identity.clientId }),
  }
}
let cached: {
  secretKey: string
  client: ReturnType<typeof createClerkClient>
} | null = null
function clerkClient(secretKey: string): ReturnType<typeof createClerkClient> {
  if (cached?.secretKey !== secretKey)
    cached = { secretKey, client: createClerkClient({ secretKey }) }
  return cached.client
}
export function resetOauthCache(): void {
  cached = null
}
/**
 * Verifies a Clerk OAuth access token. `authorizedParties` is deliberately not
 * passed: the token's authorized party is the OAuth client (the agent host), not
 * this application's origin.
 */
export async function verifyOAuthRequest(
  request: Request,
  env: Env,
): Promise<Principal | null> {
  if (env.CLERK_SECRET_KEY === undefined || env.CLERK_SECRET_KEY.length === 0) {
    throw new AppError('AUTH_NOT_CONFIGURED', 'Clerk is not configured yet.')
  }
  const state = await clerkClient(env.CLERK_SECRET_KEY).authenticateRequest(
    request,
    { acceptsToken: 'oauth_token' },
  )
  if (!state.isAuthenticated)
    return null
  const auth = state.toAuth()
  return oauthPrincipal({
    userId: auth.userId,
    clientId: auth.clientId,
    scopes: auth.scopes,
  })
}
