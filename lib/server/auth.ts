import type { Principal } from '../contracts'
import type { Env } from './env'
import { verifyToken } from '@clerk/backend'
import { z } from 'zod'
import { scopeSchema } from '../contracts'
import { digest } from './crypto'
import { AppError } from './errors'

export function checkOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== env.APP_ORIGIN)
    throw new AppError(403, 'INVALID_ORIGIN', 'This origin is not allowed.')
}
export async function authenticate(
  request: Request,
  env: Env,
  machineOnly = false,
): Promise<Principal> {
  checkOrigin(request, env)
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    throw new AppError(401, 'UNAUTHORIZED', 'A bearer token is required.')
  const token = authorization.slice(7)
  if (token.startsWith('mem_')) {
    const row = await env.DB.prepare(
      'SELECT * FROM api_tokens WHERE digest = ? AND revoked_at IS NULL AND expires_at > ?',
    )
      .bind(await digest(token), new Date().toISOString())
      .first<{
      id: string
      owner_id: string
      scopes: string
      project: string | null
    }>()
    if (!row) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'The API token is invalid, expired, or revoked.',
      )
    }
    await env.DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run()
    return {
      ownerId: row.owner_id,
      tokenId: row.id,
      scopes: z.array(scopeSchema).parse(JSON.parse(row.scopes)),
      project: row.project,
    }
  }
  if (machineOnly) {
    throw new AppError(
      401,
      'UNAUTHORIZED',
      'Use a personal API token for MCP.',
    )
  }
  if (env.CLERK_SECRET_KEY === undefined || env.CLERK_SECRET_KEY.length === 0) {
    throw new AppError(
      503,
      'AUTH_NOT_CONFIGURED',
      'Clerk is not configured yet.',
    )
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
    throw new AppError(
      401,
      'UNAUTHORIZED',
      'Your session has expired. Sign in again.',
    )
  }
}
export async function rateLimit(env: Env, principal: Principal): Promise<void> {
  const minute = Math.floor(Date.now() / 60000)
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits(bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(`${principal.ownerId}:${minute}`, (minute + 2) * 60000)
    .first<{ count: number }>()
  if (!row || row.count > 120) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      'Too many requests. Try again in one minute.',
    )
  }
}
export function requireSession(principal: Principal): void {
  if (principal.tokenId !== null) {
    throw new AppError(
      403,
      'SESSION_REQUIRED',
      'Sign in to manage tokens or account usage.',
    )
  }
}
