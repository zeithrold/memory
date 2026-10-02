import type { Page, Route } from '@playwright/test'
import type { Memory } from '../../lib/contracts'
import { expect } from '@playwright/test'
import { z } from 'zod'
import { memoryInputSchema } from '../../lib/contracts'
import { initialMemory, initialRun, initialSettings, timestamp } from './data'

const create = memoryInputSchema.extend({ idempotencyKey: z.uuid() })
const edit = memoryInputSchema.extend({ expectedVersion: z.number() })
const settingsInput = z.object({ model: z.string() })
export interface MockState {
  memories: Memory[]
  settings: ReturnType<typeof initialSettings>
  run: ReturnType<typeof initialRun>
  settingsReads: number
  runsStarted: number
  failMemories: boolean
  failSearch: boolean
  unexpected: string[]
}
function requestBody(route: Route): unknown {
  return JSON.parse(route.request().postData() ?? '{}') as unknown
}
function memoryResponse(route: Route, state: MockState, path: string): unknown {
  const method = route.request().method()
  if (path === 'memories' && method === 'GET') {
    return { memories: state.memories }
  }
  if (path === 'memories' && method === 'POST') {
    const { idempotencyKey, ...input } = create.parse(requestBody(route))
    expect(idempotencyKey).toMatch(/^[\da-f-]{36}$/)
    const memory = {
      ...input,
      id: '33333333-3333-4333-8333-333333333333',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    state.memories.unshift(memory)
    return memory
  }
  const memory = state.memories.find(item => path === `memories/${item.id}`)
  if (memory !== undefined && method === 'PATCH') {
    const { expectedVersion, ...input } = edit.parse(requestBody(route))
    expect(expectedVersion).toBe(memory.version)
    Object.assign(memory, input, { version: memory.version + 1 })
  }
  return memory
}
function catalogResponse(route: Route, state: MockState, path: string): unknown {
  if (path === 'catalog/settings') {
    if (route.request().method() === 'PUT') {
      state.settings.model = settingsInput.parse(requestBody(route)).model
    }
    else {
      state.settingsReads += 1
    }
    return state.settings
  }
  if (path === 'catalog/runs') {
    if (route.request().method() === 'POST') {
      state.runsStarted += 1
      return { budgetWarning: false }
    }
    return { runs: [state.run], total: 1, offset: 0, limit: 10 }
  }
  const responses: Record<string, unknown> = {
    'catalog': {
      version: 1,
      updatedAt: timestamp,
      categories: [],
      assigned: 0,
      orphans: 2,
      skipped: 0,
      pendingProposals: 0,
      pendingAdvice: null,
    },
    'catalog/proposals': { proposals: [] },
    'catalog/metrics': { totals: {}, daily: [] },
  }
  return responses[path]
}
function response(route: Route, state: MockState, path: string): unknown {
  if (path.startsWith('memories')) {
    return memoryResponse(route, state, path)
  }
  if (path === 'search') {
    return {
      memories: state.memories.filter(item => item.title.includes('New')),
      mode: 'keyword',
      degraded: false,
      catalog: null,
    }
  }
  return catalogResponse(route, state, path)
}
export async function mockWorkspace(page: Page): Promise<MockState> {
  const state: MockState = {
    memories: [
      initialMemory(),
    ],
    settings: initialSettings(),
    run: initialRun(),
    settingsReads: 0,
    runsStarted: 0,
    failMemories: false,
    failSearch: false,
    unexpected: [],
  }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '')
    if ((path === 'memories' && state.failMemories) || (path === 'search' && state.failSearch)) {
      await route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'TEMPORARY_FAILURE', detail: 'Please retry this request.' }),
      })
      return
    }
    const data = response(route, state, path)
    if (data === undefined) {
      state.unexpected.push(`${route.request().method()} ${path}`)
    }
    await route.fulfill({
      status: data === undefined ? 500 : 200,
      contentType: 'application/json',
      body: JSON.stringify(data ?? { code: 'UNEXPECTED' }),
    })
  })
  return state
}
