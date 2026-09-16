import type { Env } from './env'
import type { MemoryRow } from './memories'
import * as Sentry from '@sentry/cloudflare'
import { embed } from './memories'

export async function processIndexJobs(env: Env): Promise<void> {
  if (!env.VECTORIZE || !env.AI)
    return
  const jobs = await env.DB.prepare(
    'SELECT id, memory_id, version, attempts FROM index_jobs WHERE available_at <= ? ORDER BY id LIMIT 20',
  )
    .bind(Date.now())
    .all<{
    id: number
    memory_id: string
    version: number
    attempts: number
  }>()
  for (const job of jobs.results) {
    try {
      const row = await env.DB.prepare('SELECT * FROM memories WHERE id = ?')
        .bind(job.memory_id)
        .first<MemoryRow>()
      if (row && !row.deleted && row.version === job.version) {
        const values = await embed(env, `${row.title}\n${row.content}`)
        await env.VECTORIZE.upsert([
          {
            id: `${row.id}:${row.version}`,
            values,
            namespace: row.owner_id,
            metadata: { project: row.project },
          },
        ])
        // A concurrent edit/delete during embedding must not leave a stale vector.
        const current = await env.DB.prepare(
          'SELECT version, deleted FROM memories WHERE id = ?',
        )
          .bind(row.id)
          .first<{ version: number, deleted: number }>()
        if (!current || current.deleted || current.version !== row.version)
          await env.VECTORIZE.deleteByIds([`${row.id}:${row.version}`])
      }
      else {
        await env.VECTORIZE.deleteByIds([`${job.memory_id}:${job.version}`])
      }
      if (job.version > 1) {
        await env.VECTORIZE.deleteByIds([
          `${job.memory_id}:${job.version - 1}`,
        ])
      }
      await env.DB.prepare('DELETE FROM index_jobs WHERE id = ?')
        .bind(job.id)
        .run()
    }
    catch (error) {
      // The retry loop keeps the queue alive, but a provider that keeps failing
      // is otherwise invisible outside the database.
      Sentry.captureException(error, {
        tags: { job: 'index', attempts: job.attempts },
      })
      await env.DB.prepare(
        'UPDATE index_jobs SET attempts = attempts + 1, available_at = ?, last_error = ? WHERE id = ?',
      )
        .bind(
          Date.now()
          + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          'Index provider failed; retry scheduled.',
          job.id,
        )
        .run()
    }
  }
}
export async function maintenance(env: Env): Promise<void> {
  await processIndexJobs(env)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(
      Date.now(),
    ),
    env.DB.prepare('DELETE FROM usage_events WHERE created_at < ?').bind(
      new Date(Date.now() - 30 * 86400000).toISOString(),
    ),
  ])
}
