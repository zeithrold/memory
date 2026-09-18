import type { Principal } from '../contracts'
import type { Env } from './env'
import process from 'node:process'
import { verifyToken } from '@clerk/backend'
import * as Sentry from '@sentry/cloudflare'
import { z } from 'zod'
import { scopeSchema } from '../contracts'
import { digest } from './crypto'
import { AppError } from './errors'
import { verifyOAuthRequest } from './oauth'

/**
 * Credential kinds an entry point accepts. `/mcp` accepts personal tokens and
 * Clerk OAuth access tokens; `/api/v1` normally accepts sessions and personal
 * tokens. The status preflight also accepts OAuth, without exposing management
 * operations.
 */
export type CredentialKind = 'session' | 'personal' | 'oauth'
const DEFAULT_KINDS: CredentialKind[] = ['session', 'personal']

export function checkOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== env.APP_ORIGIN)
    throw new AppError('INVALID_ORIGIN', 'This origin is not allowed.')
}
export async function authenticate(
  request: Request,
  env: Env,
  kinds: CredentialKind[] = DEFAULT_KINDS,
): Promise<Principal> {
  const principal = await resolvePrincipal(request, env, kinds)
  // Error reports carry the account only as an opaque Clerk id: enough to tell
  // which user hit a failure, nothing that identifies them.
  Sentry.setUser({ id: principal.ownerId })
  Sentry.setTag('credential', principal.tokenId === null ? 'linked' : 'token')
  return principal
}
async function resolvePrincipal(
  request: Request,
  env: Env,
  kinds: CredentialKind[],
): Promise<Principal> {
  // Origin checks only guard session credentials. Machine clients may omit
  // Origin, and no cookie is ever honored on those paths.
  if (kinds.includes('session'))
    checkOrigin(request, env)
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    throw new AppError('UNAUTHORIZED', 'A bearer token is required.')
  const token = authorization.slice(7)
  if (token.startsWith('mem_')) {
    if (!kinds.includes('personal')) {
      throw new AppError('UNAUTHORIZED', 'This endpoint does not accept personal API tokens.')
    }
    const row = await env.DB.prepare(
      'SELECT * FROM api_tokens WHERE digest = ? AND revoked_at IS NULL AND expires_at > ?',
    )
      .bind(await digest(token), new Date().toISOString())
      .first<{
      id: string
      owner_id: string
      scopes: string
      project: string | null
      last_used_at: string | null
    }>()
    if (!row) {
      throw new AppError('UNAUTHORIZED', 'The API token is invalid, expired, or revoked.')
    }
    const now = Date.now()
    const lastUsed = row.last_used_at === null ? 0 : Date.parse(row.last_used_at)
    if (!Number.isFinite(lastUsed) || now - lastUsed >= 3600000) {
      const update = env.DB.prepare(
        'UPDATE api_tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)',
      )
        .bind(
          new Date(now).toISOString(),
          row.id,
          new Date(now - 3600000).toISOString(),
        )
        .run()
        .catch(() => console.error('Token activity update failed', { tokenId: row.id.slice(0, 8) }))
      if (process.env.NODE_ENV === 'test')
        void update
      else
        (await import('cloudflare:workers')).waitUntil(update)
    }
    return {
      ownerId: row.owner_id,
      tokenId: row.id,
      scopes: z.array(scopeSchema).parse(JSON.parse(row.scopes)),
      project: row.project,
    }
  }
  if (kinds.includes('oauth')) {
    const principal = await verifyOAuthRequest(request, env)
    if (principal !== null)
      return principal
  }
  if (!kinds.includes('session')) {
    throw new AppError('UNAUTHORIZED', 'Use a personal API token or an OAuth connection for MCP.')
  }
  if (env.CLERK_SECRET_KEY === undefined || env.CLERK_SECRET_KEY.length === 0) {
    throw new AppError('AUTH_NOT_CONFIGURED', 'Clerk is not configured yet.')
  }
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: [env.APP_ORIGIN],
    })
    return {
      ownerId: payload.sub,
      tokenId: null,
      scopes: ['memory:read', 'memory:write', 'memory:delete'],
      project: null,
    }
  }
  catch {
    throw new AppError('UNAUTHORIZED', 'Your session has expired. Sign in again.')
  }
}
function maySkipMissingBinding(env: Env): boolean {
  return env.APP_ORIGIN.includes('localhost')
    || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')
}

async function enforceLimiter(
  env: Env,
  limiter: RateLimit | undefined,
  key: string,
  binding: string,
): Promise<void> {
  if (limiter === undefined) {
    if (maySkipMissingBinding(env))
      return
    console.error('Required rate limiter binding is missing', { binding })
    throw new AppError('INTERNAL_ERROR', 'Request protection is not configured.')
  }
  const outcome = await limiter.limit({ key })
  if (!outcome.success) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Try again in one minute.')
  }
}

export async function preAuthRateLimit(request: Request, env: Env): Promise<void> {
  await enforceLimiter(
    env,
    env.AUTH_RATE_LIMITER,
    request.headers.get('cf-connecting-ip') ?? 'unknown',
    'AUTH_RATE_LIMITER',
  )
}

export async function rateLimit(env: Env, principal: Principal): Promise<void> {
  await enforceLimiter(env, env.API_RATE_LIMITER, principal.ownerId, 'API_RATE_LIMITER')
}
export function requireSession(principal: Principal): void {
  if (principal.tokenId !== null) {
    throw new AppError('SESSION_REQUIRED', 'Sign in to manage tokens or account usage.')
  }
}
