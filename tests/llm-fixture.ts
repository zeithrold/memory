import type { Mock } from 'vitest'
import type { Env } from '../lib/server/env'
import type { ModelMessage, Provider, ToolSpec } from '../lib/server/llm'
import { afterAll, afterEach, vi } from 'vitest'
import { database } from './database'

const store = database()
const env: Env = { DB: store.db, APP_ORIGIN: 'https://memory.example' }

const provider: Provider = {
  kind: 'responses-api',
  model: 'catalog-model',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-live-secret',
}

const tool: ToolSpec = {
  name: 'assign',
  description: 'Assign a memory to a category.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}

const messages: ModelMessage[] = [
  { role: 'system', content: 'Use tools only.' },
  { role: 'user', content: 'Organize this batch.' },
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function response(
  output: unknown[],
  status: 'completed' | 'incomplete' | 'failed' = 'completed',
  extra: Record<string, unknown> = {},
): unknown {
  return {
    status,
    output,
    usage: { input_tokens: 11, output_tokens: 7 },
    ...extra,
  }
}

function functionCall(name: string, args: string, callId?: string): unknown {
  return {
    type: 'function_call',
    ...(callId === undefined ? {} : { call_id: callId }),
    name,
    arguments: args,
  }
}

function message(text: string): unknown {
  return {
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'output_text', text },
    ],
  }
}

function mockFetch(handler: (
  url: string,
  init: RequestInit,
) => Response | Promise<Response>): Mock<(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    await handler(input instanceof Request ? input.url : String(input), init ?? {}))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})
export {
  env,
  functionCall,
  jsonResponse,
  message,
  messages,
  mockFetch,
  provider,
  response,
  tool,
}

afterAll(() => {
  store.sqlite.close()
})
