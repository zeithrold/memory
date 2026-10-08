import type { Memory, MemoryInput, MemoryRevision, Principal } from '../contracts'
import type { Env } from './env'
import { z } from 'zod'
import { digest } from './crypto'
import { AppError, requirePermission } from './errors'
import { terms } from './search'

export type MemoryRow = {
  id: string
  owner_id: string
  project: string
  title: string
  content: string
  kind: MemoryInput['kind']
  tags: string
  source: string
  fingerprint: string
  version: number
  deleted: number
  created_at: string
  updated_at: string
}

export function serialize(row: MemoryRow): Memory {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    content: row.content,
    kind: row.kind,
    tags: z.array(z.string()).parse(JSON.parse(row.tags)),
    source: row.source,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fingerprint(input: MemoryInput): Promise<string> {
  return await digest(
    (`${input.title.trim().normalize('NFKC').toLowerCase()}`
      + '\n'
      + `${input.content.trim().normalize('NFKC').toLowerCase()}`),
  )
}

export function searchText(input: MemoryInput): string {
  return terms(`${input.title} ${input.content} ${input.tags.join(' ')}`).join(
    ' ',
  )
}

export async function getRow(
  env: Env,
  principal: Principal,
  id: string,
): Promise<MemoryRow> {
  const row = await env.DB.prepare(
    'SELECT * FROM memories WHERE id = ? AND owner_id = ? AND deleted = 0',
  )
    .bind(id, principal.ownerId)
    .first<MemoryRow>()
  if (!(row !== null) || (principal.project !== null && row.project !== principal.project)) {
    throw new AppError('NOT_FOUND', 'Memory not found.')
  }
  return row
}

export async function getMemory(
  env: Env,
  principal: Principal,
  id: string,
): Promise<Memory> {
  requirePermission(principal, 'memory:read')
  return serialize(await getRow(env, principal, id))
}

export async function listMemories(
  env: Env,
  principal: Principal,
  project: string,
  offset: number,
): Promise<Memory[]> {
  requirePermission(principal, 'memory:read', project)
  const rows = await env.DB.prepare(
    ('SELECT * FROM memories WHERE owner_id = ? AND project = ? AND deleted = 0 '
      + 'ORDER BY updated_at DESC, id LIMIT 30 OFFSET ?'),
  )
    .bind(principal.ownerId, project, offset)
    .all<MemoryRow>()
  return rows.results.map(serialize)
}

export async function history(
  env: Env,
  principal: Principal,
  id: string,
): Promise<MemoryRevision[]> {
  requirePermission(principal, 'memory:read')
  await getRow(env, principal, id)
  const result = await env.DB.prepare(
    ('SELECT version, title, content, kind, tags, source, created_at FROM '
      + 'revisions WHERE memory_id = ? ORDER BY version DESC LIMIT 50'),
  )
    .bind(id)
    .all<MemoryRevision>()
  return result.results
}
