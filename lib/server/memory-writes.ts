import type { Memory, Principal } from '../contracts'
import type { Env } from './env'
import type { MemoryRow } from './memory-rows'
import { createSchema, projectSchema, updateSchema } from '../contracts'
import { AppError, requirePermission } from './errors'
import { fingerprint, getRow, searchText, serialize } from './memory-rows'

interface FindCreatedMemoryContext {
  env: Env
  principal: Principal
  input: {
    project: string
    title: string
    content: string
    kind: 'preference' | 'fact' | 'decision' | 'experience'
    tags: string[]
    source: string
    idempotencyKey: string
  }
  hash: string
}
async function findCreatedMemory(
  context: FindCreatedMemoryContext,
): Promise<{ row: MemoryRow | null }> {
  const { env, principal, input, hash } = context
  const row = await env.DB.prepare(
    ('SELECT * FROM memories WHERE owner_id = ? AND (idempotency_key = ? OR '
      + '(project = ? AND fingerprint = ?)) ORDER BY CASE WHEN idempotency_key = ? '
      + 'THEN 0 ELSE 1 END LIMIT 1'),
  )
    .bind(
      principal.ownerId,
      input.idempotencyKey,
      input.project,
      hash,
      input.idempotencyKey,
    )
    .first<MemoryRow>()
  return { row }
}
export async function createMemory(
  env: Env,
  principal: Principal,
  value: unknown,
): Promise<Memory> {
  const input = createSchema.parse(value)
  requirePermission(principal, 'memory:write', input.project)
  const hash = await fingerprint(input)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  // Both deduplication keys are enforced by SQLite, including concurrent writers.
  await env.DB.prepare(
    `INSERT INTO memories(id, owner_id, project, title, content, kind, tags, source, fingerprint,
idempotency_key, search_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  )
    .bind(
      id,
      principal.ownerId,
      input.project,
      input.title,
      input.content,
      input.kind,
      JSON.stringify(input.tags),
      input.source,
      hash,
      input.idempotencyKey,
      searchText(input),
      now,
      now,
    )
    .run()
  const { row } = await findCreatedMemory({ env, principal, input, hash })
  if (row === null || row.deleted !== 0) {
    throw new AppError(
      'FORGOTTEN',
      'An identical memory was forgotten. Do not automatically save it again.',
    )
  }
  if (
    row.project !== input.project
    || row.fingerprint !== hash
    || row.kind !== input.kind
    || row.tags !== JSON.stringify(input.tags)
    || row.source !== input.source
  ) {
    throw new AppError(
      'CONFLICT',
      ('The idempotency key or content already exists with different fields. Read '
        + 'the current memory before editing.'),
    )
  }
  return serialize(row)
}

export async function updateMemory(
  env: Env,
  principal: Principal,
  id: string,
  value: unknown,
): Promise<Memory> {
  const input = updateSchema.parse(value)
  requirePermission(principal, 'memory:write', input.project)
  const previous = await getRow(env, principal, id)
  if (input.project !== previous.project) {
    throw new AppError('IMMUTABLE_PROJECT', 'A memory cannot be moved to another project.')
  }
  const hash = await fingerprint(input)
  const duplicate = await env.DB.prepare(
    'SELECT id FROM memories WHERE owner_id = ? AND project = ? AND fingerprint = ? AND id != ?',
  )
    .bind(
      principal.ownerId,
      input.project,
      hash,
      id,
    )
    .first()
  if ((duplicate !== null)) {
    throw new AppError('CONFLICT', 'This content already exists or was forgotten.')
  }
  let changes: number
  try {
    const result = await env.DB.prepare(
      `UPDATE memories SET title = ?, content = ?, kind = ?, tags = ?, source = ?, fingerprint
= ?, search_text = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
    )
      .bind(
        input.title,
        input.content,
        input.kind,
        JSON.stringify(input.tags),
        input.source,
        hash,
        searchText(input),
        new Date().toISOString(),
        id,
        principal.ownerId,
        input.expectedVersion,
      )
      .run()
    changes = result.meta.changes
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      throw new AppError('CONFLICT', 'This content already exists.')
    }
    throw error
  }
  if (!(changes !== 0)) {
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before editing.')
  }
  return serialize(await getRow(env, principal, id))
}

/**
 * Moves a memory to another project.
 *
 * `project` stays immutable for every client: `update` still refuses to change
 * it. This exists only so a user can approve a proposal the catalog agent made,
 * because the agent itself must never move a memory — a move immediately
 * changes which project-restricted tokens can see it.
 *
 * The existing `memories_update` trigger queues a fresh index job, so the vector
 * is rewritten under the new project and the previous version is deleted.
 */
interface MoveMemoryProjectOptions { id: string, expectedVersion: number, targetProject: string }

export async function moveMemoryProject(
  env: Env,
  principal: Principal,
  options: MoveMemoryProjectOptions,
): Promise<Memory> {
  const { id, expectedVersion, targetProject } = options

  const project = projectSchema.parse(targetProject)
  requirePermission(principal, 'memory:write', project)
  const previous = await getRow(env, principal, id)
  if (previous.project === project) {
    return serialize(previous)
  }
  let changes: number
  try {
    const result = await env.DB.prepare(
      `UPDATE memories SET project = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
    )
      .bind(project, new Date().toISOString(), id, principal.ownerId, expectedVersion)
      .run()
    changes = result.meta.changes
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      throw new AppError(
        'CONFLICT',
        'The target project already holds an identical memory. Read it before reconciling.',
      )
    }
    throw error
  }
  if (!(changes !== 0)) {
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before moving it.')
  }
  return serialize(await getRow(env, principal, id))
}

export async function deleteMemory(
  env: Env,
  principal: Principal,
  id: string,
  expectedVersion: number,
): Promise<void> {
  requirePermission(principal, 'memory:delete')
  await getRow(env, principal, id)
  const result = await env.DB.prepare(
    `UPDATE memories SET deleted = 1, title = '', content = '', source = '', tags = '[]', search_text
= '', version = version + 1, updated_at = ?
    WHERE id = ? AND owner_id = ? AND version = ? AND deleted = 0`,
  )
    .bind(
      new Date().toISOString(),
      id,
      principal.ownerId,
      expectedVersion,
    )
    .run()
  if (!(result.meta.changes !== 0)) {
    throw new AppError('VERSION_CONFLICT', 'The memory changed. Read it again before deleting.')
  }
}
