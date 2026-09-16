import type { Principal } from '../contracts'
import type { Env } from './env'
import { z } from 'zod'
import { projectSchema, tokenInputSchema } from '../contracts'
import { authenticate, rateLimit, requireSession } from './auth'
import { catalogApi } from './catalog/api'
import { digest, randomToken } from './crypto'
import { AppError, errorResponse } from './errors'
import { readJson, secureResponse } from './http'
import {
  createMemory,
  deleteMemory,
  getMemory,
  history,
  listMemories,
  searchMemories,
  updateMemory,
} from './memories'
import { recordUsage } from './usage'

export async function api(request: Request, env: Env): Promise<Response> {
  let principal: Principal | undefined
  const started = Date.now()
  const url = new URL(request.url)
  const path = url.pathname
    .replace(/^\/api\/v1\/?/, '')
    .split('/')
    .filter(Boolean)
  const [resource = '', id = '', action = ''] = path
  const allowed = ['memories', 'search', 'tokens', 'usage', 'status', 'catalog']
  const operation = `${request.method} ${resource && allowed.includes(resource) ? resource : 'unknown'}${action === 'history' ? '/history' : ''}`
  let response: Response
  try {
    principal = await authenticate(request, env)
    await rateLimit(env, principal)
    response = await route()
  }
  catch (error) {
    response = errorResponse(error, {
      origin: env.APP_ORIGIN,
      instance: url.pathname,
      method: request.method,
    })
  }
  if (principal)
    await recordUsage(env, principal, operation, response.status, started)
  return secureResponse(response)

  async function route(): Promise<Response> {
    if (!principal)
      throw new AppError('UNAUTHORIZED', 'Sign in to continue.')
    if (resource === 'memories') {
      if (id)
        z.string().uuid().parse(id)
      if (!id && request.method === 'GET') {
        return Response.json({
          memories: await listMemories(
            env,
            principal,
            projectSchema.parse(url.searchParams.get('project') ?? 'global'),
            z.coerce
              .number()
              .int()
              .min(0)
              .max(100000)
              .parse(url.searchParams.get('offset') ?? 0),
          ),
        })
      }
      if (!id && request.method === 'POST') {
        return Response.json(
          await createMemory(env, principal, await readJson(request)),
          { status: 201 },
        )
      }
      if (id && action === 'history' && request.method === 'GET')
        return Response.json({ revisions: await history(env, principal, id) })
      if (id && !action && request.method === 'GET')
        return Response.json(await getMemory(env, principal, id))
      if (id && !action && request.method === 'PATCH') {
        return Response.json(
          await updateMemory(env, principal, id, await readJson(request)),
        )
      }
      if (id && !action && request.method === 'DELETE') {
        const input = z
          .object({ expectedVersion: z.number().int().positive() })
          .strict()
          .parse(await readJson(request))
        await deleteMemory(env, principal, id, input.expectedVersion)
        return new Response(null, { status: 204 })
      }
    }
    if (resource === 'search' && !id && request.method === 'POST') {
      return Response.json(
        await searchMemories(env, principal, await readJson(request)),
      )
    }
    if (resource === 'tokens') {
      requireSession(principal)
      if (request.method === 'GET' && !id) {
        const rows = await env.DB.prepare(
          'SELECT id, name, prefix, scopes, project, created_at, expires_at, revoked_at, last_used_at FROM api_tokens WHERE owner_id = ? ORDER BY created_at DESC',
        )
          .bind(principal.ownerId)
          .all<{ scopes: string }>()
        return Response.json({
          tokens: rows.results.map(row => ({
            ...row,
            scopes: JSON.parse(row.scopes) as unknown,
          })),
        })
      }
      if (request.method === 'POST' && !id) {
        const input = tokenInputSchema.parse(await readJson(request))
        const token = randomToken()
        const tokenId = crypto.randomUUID()
        await env.DB.prepare(
          'INSERT INTO api_tokens(id, owner_id, name, digest, prefix, scopes, project, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(
            tokenId,
            principal.ownerId,
            input.name,
            await digest(token),
            token.slice(0, 12),
            JSON.stringify(input.scopes),
            input.project,
            new Date().toISOString(),
            new Date(Date.now() + input.expiresInDays * 86400000).toISOString(),
          )
          .run()
        return Response.json({ id: tokenId, token }, { status: 201 })
      }
      if (request.method === 'DELETE' && id && !action) {
        const result = await env.DB.prepare(
          'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND owner_id = ?',
        )
          .bind(new Date().toISOString(), id, principal.ownerId)
          .run()
        if (!result.meta.changes)
          throw new AppError('NOT_FOUND', 'Token not found.')
        return new Response(null, { status: 204 })
      }
    }
    if (resource === 'usage' && !id && request.method === 'GET') {
      requireSession(principal)
      const result = await env.DB.prepare(
        `SELECT substr(u.created_at, 1, 10) AS day, u.token_id, t.name AS token_name, u.client_id, u.operation, count(*) AS calls, sum(CASE WHEN u.status >= 400 THEN 1 ELSE 0 END) AS errors, round(avg(u.duration_ms)) AS average_ms FROM usage_events u LEFT JOIN api_tokens t ON t.id = u.token_id AND t.owner_id = u.owner_id WHERE u.owner_id = ? AND u.created_at >= ? GROUP BY day, u.token_id, t.name, u.client_id, u.operation ORDER BY day DESC, calls DESC LIMIT 500`,
      )
        .bind(
          principal.ownerId,
          new Date(Date.now() - 30 * 86400000).toISOString(),
        )
        .all()
      return Response.json({ usage: result.results })
    }
    if (resource === 'status' && !id && request.method === 'GET') {
      requireSession(principal)
      const result = await env.DB.prepare(
        'SELECT count(*) AS pending, sum(CASE WHEN attempts > 0 THEN 1 ELSE 0 END) AS retrying FROM index_jobs JOIN memories ON memories.id = index_jobs.memory_id WHERE memories.owner_id = ?',
      )
        .bind(principal.ownerId)
        .first()
      return Response.json({
        semanticEnabled: Boolean(env.AI && env.VECTORIZE),
        index: result,
      })
    }
    if (resource === 'catalog')
      return catalogApi(request, env, principal, path)
    throw new AppError('NOT_FOUND', 'Endpoint not found.')
  }
}
