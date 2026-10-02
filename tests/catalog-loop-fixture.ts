import type { Mock } from 'vitest'
import type { Principal } from '../lib/contracts'
import type { TurnInput } from '../lib/server/catalog/turn'
import type { Env } from '../lib/server/env'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { z } from 'zod'
import { updateCatalogSettings } from '../lib/server/catalog/settings'
import { createMemory } from '../lib/server/memories'
import { database } from './database'

const MASTER_KEY = 'd'.repeat(64)

const API_KEY = 'sk-live-0123456789abcdef'

const alice: Principal = {
  ownerId: 'alice',
  tokenId: null,
  scopes: [
    'memory:read',
    'memory:write',
    'memory:delete',
  ],
  project: null,
}

let env: Env

let store: ReturnType<typeof database>

let runId = ''

let memoryIds: string[] = []

/** A completed Responses API envelope whose only output is function calls. */
function calls(list: { name: string, arguments: unknown }[]): Response {
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: list.map((call, index) => ({
        type: 'function_call',
        call_id: `call_${index}`,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      })),
      usage: { input_tokens: 40, output_tokens: 12 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function prose(text: string): Response {
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text },
          ],
        },
      ],
      usage: { input_tokens: 30, output_tokens: 5 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function terminalFailure(status: 'incomplete' | 'failed', detail: string): Response {
  return new Response(
    JSON.stringify({
      status,
      output: [],
      ...(status === 'incomplete'
        ? { incomplete_details: { reason: detail } }
        : { error: { code: detail, message: 'Provider failed.' } }),
      usage: { input_tokens: 70, output_tokens: 19 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

/** Queues provider replies in order and returns the fetch mock for inspection. */
function script(...responses: Response[]): Mock<() => Promise<Response>> {
  let index = 0
  const mock = vi.fn(async () => {
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    return await Promise.resolve(response ?? prose('done'))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(async () => {
  store = database()
  env = {
    DB: store.db,
    APP_ORIGIN: 'https://memory.example',
    AGENT_SETTINGS_KEY: MASTER_KEY,
  }
  await updateCatalogSettings(env, 'alice', {
    provider: 'responses-api',
    baseUrl: 'https://api.example.com/v1',
    model: 'deepseek-v4-flash',
    apiKey: API_KEY,
    enabled: true,
  })
  const first = await createMemory(env, alice, {
    project: 'global',
    title: 'Database access',
    content: 'Prefer sqlc and pgx rather than an ORM for Go services.',
    kind: 'preference',
    tags: ['go', 'database'],
    source: 'Stated in planning, 2026-09-16.',
    idempotencyKey: crypto.randomUUID(),
  })
  const second = await createMemory(env, alice, {
    project: 'global',
    title: 'Release checklist',
    content: 'Run pnpm check before every deployment.',
    kind: 'decision',
    tags: ['release'],
    source: 'Agreed with the team, 2026-09-15.',
    idempotencyKey: crypto.randomUUID(),
  })
  memoryIds = [first.id, second.id]
  runId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO catalog_runs(id, owner_id, trigger, mode, status, provider, model, started_at)
     VALUES (?, 'alice', 'manual', ?, 'running', 'responses-api', 'deepseek-v4-flash',
?)`,
  )
    .bind(runId, 'live', new Date().toISOString())
    .run()
})

afterEach(() => {
  store.sqlite.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function input(overrides: Partial<TurnInput> = {}): TurnInput {
  return {
    env,
    ownerId: 'alice',
    runId,
    batch: 0,
    turn: 0,
    mode: 'live',
    includeContent: false,
    maxToolCalls: 8,
    memoryIds,
    ...overrides,
  }
}

async function callsOf(
  mock: { mock: { calls: unknown[][] } },
  index = 0,
): Promise<{ messages: { role: string, content: string }[], tools: { function: { name: string } }[] }> {
  const init = z.looseObject({ body: z.string() }).parse(mock.mock.calls[index]?.[1])
  expect(init, 'the model endpoint was never called').toBeDefined()
  const body = z.looseObject({
    instructions: z.string(),
    input: z.array(z.looseObject({
      type: z.string(),
      role: z.string().optional(),
      content: z.array(z.looseObject({ text: z.string().optional() })).optional(),
    })),
    tools: z.array(z.looseObject({ name: z.string() })),
  }).parse(JSON.parse(init.body))
  return await Promise.resolve({
    messages: [
      { role: 'system', content: body.instructions },
      ...body.input
        .filter(item => item.type === 'message')
        .map(item => ({
          role: item.role ?? '',
          content: (item.content ?? []).map(part => part.text ?? '').join('\n'),
        })),
    ],
    tools: body.tools.map(tool => ({ function: { name: tool.name } })),
  })
}

type ActionsResult = Promise<{
  tool: string
  decision: string
  policy_reason: string | null
  memory_id: string | null
  category_id: string | null
}[]>

async function actions(): ActionsResult {
  const rows = await env.DB.prepare(
    'SELECT tool, decision, policy_reason, memory_id, category_id FROM catalog_actions ORDER BY call_index',
  )
    .all<{
    tool: string
    decision: string
    policy_reason: string | null
    memory_id: string | null
    category_id: string | null
  }>()
  return rows.results
}

async function categoryCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM categories').first<{ n: number }>()
  return row?.n ?? 0
}

/** Creates a category directly, standing in for one a previous run consolidated. */
async function seedCategory(
  slug: string,
  label: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO categories(id, owner_id, parent_id, slug, label, description, boundary, depth,
created_by, created_at, updated_at)
     VALUES (?, 'alice', NULL, ?, ?, ?, ?, 1, 'user', ?, ?)`,
  )
    .bind(
      id,
      slug,
      label,
      `${label} holds related entries.`,
      `NOT here: anything unrelated to ${label}.`,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run()
  return id
}
export {
  actions,
  alice,
  API_KEY,
  calls,
  callsOf,
  categoryCount,
  input,
  MASTER_KEY,
  prose,
  script,
  seedCategory,
  terminalFailure,
}

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
  get runId(): string {
    return runId
  },
  set runId(value: string) {
    runId = value
  },
  get memoryIds(): string[] {
    return memoryIds
  },
  set memoryIds(value: string[]) {
    memoryIds = value
  },
}
