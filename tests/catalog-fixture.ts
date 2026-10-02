import type { Env } from '../lib/server/env'
import { afterEach, beforeEach } from 'vitest'

import { database } from './database'

const MASTER_KEY = 'a'.repeat(64)

let env: Env

let store: ReturnType<typeof database>

beforeEach(() => {
  store = database()
  env = { DB: store.db, APP_ORIGIN: 'https://memory.example', AGENT_SETTINGS_KEY: MASTER_KEY }
})

afterEach(() => {
  store.sqlite.close()
})

interface CategoryInput {
  id: string
  ownerId?: string
  parentId?: string | null
  slug: string
  depth?: number
}

async function insertCategory(
  input: CategoryInput,
): Promise<D1Result<Record<string, unknown>>> {
  const depth = input.depth ?? ((input.parentId ?? null) === null ? 1 : 2)
  return await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', '2026-09-16T00:00:00.000Z', '2026-09-16T00:00:00.000Z')`,
  )
    .bind(
      input.id,
      input.ownerId ?? 'alice',
      input.parentId ?? null,
      input.slug,
      input.slug,
      `${input.slug} description`,
      `NOT here: anything that is not ${input.slug}`,
      depth,
    )
    .run()
}
export { insertCategory, MASTER_KEY }
export type { CategoryInput }

export const fixture = {
  get env(): Env {
    return env
  },
  set env(value: Env) {
    env = value
  },
  get store(): ReturnType<typeof database> {
    return store
  },
  set store(value: ReturnType<typeof database>) {
    store = value
  },
}
