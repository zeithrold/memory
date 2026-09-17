import type { Principal } from '../contracts'
import type { Env } from './env'
import { tokenInputSchema } from '../contracts'
import { digest, randomToken } from './crypto'
import { AppError } from './errors'

export async function listTokens(env: Env, ownerId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT id, name, prefix, scopes, project, created_at, expires_at, revoked_at, last_used_at FROM api_tokens WHERE owner_id = ? ORDER BY created_at DESC',
  ).bind(ownerId).all<{ scopes: string }>()
  return Response.json({
    tokens: rows.results.map(row => ({ ...row, scopes: JSON.parse(row.scopes) as unknown })),
  })
}

export async function createToken(env: Env, principal: Principal, raw: unknown): Promise<Response> {
  const input = tokenInputSchema.parse(raw)
  const token = randomToken()
  const tokenId = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    tokenId,
    principal.ownerId,
    input.name,
    await digest(token),
    token.slice(0, 12),
    JSON.stringify(input.scopes),
    input.project,
    new Date().toISOString(),
    new Date(Date.now() + input.expiresInDays * 86400000).toISOString(),
  ).run()
  return Response.json({ id: tokenId, token }, { status: 201 })
}

export async function revokeToken(env: Env, ownerId: string, id: string): Promise<Response> {
  const result = await env.DB.prepare(
    'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND owner_id = ?',
  ).bind(new Date().toISOString(), id, ownerId).run()
  if (!result.meta.changes)
    throw new AppError('NOT_FOUND', 'Token not found.')
  return new Response(null, { status: 204 })
}

export async function getStatus(env: Env, ownerId: string): Promise<Response> {
  const result = await env.DB.prepare(
    'SELECT count(*) AS pending, sum(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS retrying FROM index_jobs JOIN memories ON memories.id = index_jobs.memory_id WHERE memories.owner_id = ?',
  ).bind(ownerId).first()
  return Response.json({ semanticEnabled: Boolean(env.AI && env.VECTORIZE), index: result })
}
