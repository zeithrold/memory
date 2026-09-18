import type { Principal, Scope } from '../contracts'
import type { Env } from './env'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { AppError } from './errors'

// The MCP authorization contract expects an OAuth 2.1 authorization server.
// Cloudflare Access Managed OAuth is that server; this module implements the
// resource-server half: discovery metadata, the WWW-Authenticate challenge when
// Access is not in front, and mapping a verified Access JWT onto a Principal.
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

/** Team domain from Worker env or the public build-time value. */
export function accessIssuer(
  env: Pick<Env, 'ACCESS_TEAM_DOMAIN'> = {},
): string | null {
  const explicit = env.ACCESS_TEAM_DOMAIN?.trim()
  if (explicit !== undefined && explicit.length > 0)
    return trimOrigin(explicit)
  // Vite replaces the global expression; importing node:process prevents it.
  // eslint-disable-next-line node/prefer-global/process
  const fromPublic = process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN?.trim()
  if (fromPublic !== undefined && fromPublic.length > 0)
    return trimOrigin(fromPublic)
  return null
}

export function accessAudience(env: Pick<Env, 'ACCESS_AUD'>): string | null {
  const aud = env.ACCESS_AUD?.trim()
  if (aud === undefined || aud.length === 0)
    return null
  return aud
}

export function resourceMetadataUrl(env: Env): string {
  return `${trimOrigin(env.APP_ORIGIN)}${PROTECTED_RESOURCE_PATH}`
}

export function protectedResourceMetadata(
  env: Env,
  resource: string,
): ProtectedResourceMetadata | null {
  const issuer = accessIssuer(env)
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

export function accessPrincipal(ownerId: string): Principal {
  return {
    ownerId,
    tokenId: null,
    scopes: [...OAUTH_SCOPES],
    project: null,
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (header === null || header.length === 0)
    return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0)
      continue
    if (trimmed.slice(0, eq) !== name)
      continue
    return decodeURIComponent(trimmed.slice(eq + 1))
  }
  return null
}

let cachedJwks: {
  teamDomain: string
  jwks: ReturnType<typeof createRemoteJWKSet>
} | null = null

function accessJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks?.teamDomain !== teamDomain) {
    cachedJwks = {
      teamDomain,
      jwks: createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)),
    }
  }
  return cachedJwks.jwks
}

export function resetAccessJwksCache(): void {
  cachedJwks = null
}

/**
 * Verifies a Cloudflare Access application JWT from the edge assertion header
 * or the CF_Authorization cookie. Returns null when no token is present so the
 * caller can fall through to another credential kind.
 */
export async function verifyAccessJwt(
  request: Request,
  env: Env,
): Promise<Principal | null> {
  const token = request.headers.get('cf-access-jwt-assertion')
    ?? cookieValue(request, 'CF_Authorization')
  if (token === null || token.length === 0)
    return null
  const teamDomain = accessIssuer(env)
  const audience = accessAudience(env)
  if (teamDomain === null || audience === null) {
    throw new AppError('AUTH_NOT_CONFIGURED', 'Cloudflare Access is not configured yet.')
  }
  try {
    const { payload } = await jwtVerify(token, accessJwks(teamDomain), {
      issuer: teamDomain,
      audience,
    })
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : ''
    // Service-token assertions carry an empty sub; this app needs a user identity.
    if (sub.length === 0) {
      throw new AppError(
        'UNAUTHORIZED',
        'This Access credential does not identify a user.',
      )
    }
    return accessPrincipal(sub)
  }
  catch (error) {
    if (error instanceof AppError)
      throw error
    console.error('Access JWT verification failed', {
      type: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message.slice(0, 200) : '',
    })
    throw new AppError(
      'UNAUTHORIZED',
      'Your session has expired. Sign in again.',
    )
  }
}
