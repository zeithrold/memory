import type { Env } from '../lib/server/env'
import type { ModelMessage, Provider, ToolSpec } from '../lib/server/llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../lib/server/errors'
import {
  assertActionableReply,
  normalizeBaseUrl,
  probeProvider,
  respondWithTools,
} from '../lib/server/llm'

const env: Env = { DB: undefined as unknown as D1Database, APP_ORIGIN: 'https://memory.example' }
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
    content: [{ type: 'output_text', text }],
  }
}
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {}))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base URL normalisation', () => {
  it('keeps a provider version path and drops trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.example.com/v1/', false)).toBe(
      'https://api.example.com/v1',
    )
    expect(normalizeBaseUrl('  https://api.example.com  ', false)).toBe('https://api.example.com')
  })
  it('requires HTTPS except for a loopback host outside production', () => {
    expect(() => normalizeBaseUrl('http://api.example.com', false)).toThrow(AppError)
    expect(() => normalizeBaseUrl('http://localhost:11434', false)).toThrow(/HTTPS/)
    expect(normalizeBaseUrl('http://localhost:11434/', true)).toBe('http://localhost:11434')
    expect(normalizeBaseUrl('http://127.0.0.1:8080', true)).toBe('http://127.0.0.1:8080')
  })
  it('rejects a query string, a fragment and a non-URL', () => {
    expect(() => normalizeBaseUrl('https://api.example.com?key=1', false)).toThrow(/query string/)
    expect(() => normalizeBaseUrl('https://api.example.com#x', false)).toThrow(/query string/)
    expect(() => normalizeBaseUrl('not a url', false)).toThrow(/not a valid URL/)
    expect(() => normalizeBaseUrl('   ', false)).toThrow(/Enter a model endpoint/)
  })
})

describe('responses API provider', () => {
  it('posts the required Responses fields and refuses redirects', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(response([functionCall('assign', '{}', 'call_1')])))
    await respondWithTools(env, provider, messages, [tool], { maxOutputTokens: 4096 })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.example.com/v1/responses')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-live-secret')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'catalog-model',
      instructions: 'Use tools only.',
      reasoning: { effort: 'none' },
      tool_choice: 'required',
      max_output_tokens: 4096,
    })
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Organize this batch.' }] },
    ])
    expect(body.tools).toEqual([
      { type: 'function', name: 'assign', description: tool.description, parameters: tool.parameters },
    ])
    expect(body).not.toHaveProperty('temperature')
  })

  it('omits tool fields when there are no tools', async () => {
    const fetchMock = mockFetch(() => jsonResponse(response([message('hi')])))
    await respondWithTools(env, provider, messages, [])
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('extracts text, multiple function calls, usage and malformed arguments safely', async () => {
    mockFetch(() => jsonResponse(response([
      { type: 'reasoning', id: 'reasoning_1', summary: [] },
      message('working'),
      functionCall('assign', '{"memoryId":"m1"}', 'call_1'),
      functionCall('skip', 'not json'),
    ])))
    const reply = await respondWithTools(env, provider, messages, [tool])
    expect(reply).toMatchObject({
      content: 'working',
      status: 'completed',
      finishReason: 'completed',
      usage: { promptTokens: 11, completionTokens: 7 },
    })
    expect(reply.toolCalls).toEqual([
      { id: 'call_1', name: 'assign', arguments: { memoryId: 'm1' } },
      { id: 'call_1', name: 'skip', arguments: 'not json' },
    ])
  })

  it('rebuilds prior function calls and outputs without a previous response id', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(response([functionCall('assign', '{}', 'call_10')])))
    await respondWithTools(
      env,
      provider,
      [
        ...messages,
        { role: 'assistant', content: 'thinking', toolCalls: [{ id: 'call_9', name: 'assign', arguments: { a: 1 } }] },
        { role: 'tool', content: '{"applied":true}', toolCallId: 'call_9' },
      ],
      [tool],
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: unknown[] }
    expect(body.input.slice(1)).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'thinking' }] },
      { type: 'function_call', call_id: 'call_9', name: 'assign', arguments: '{"a":1}' },
      { type: 'function_call_output', call_id: 'call_9', output: '{"applied":true}' },
    ])
    expect(body).not.toHaveProperty('previous_response_id')
  })

  it('preserves incomplete and failed terminal states for the caller guard', async () => {
    mockFetch(() => jsonResponse(response([], 'incomplete', {
      incomplete_details: { reason: 'max_output_tokens' },
    })))
    const incomplete = await respondWithTools(env, provider, messages, [tool])
    expect(incomplete.finishReason).toBe('incomplete:max_output_tokens')
    expect(() => assertActionableReply(incomplete)).toThrowError(expect.objectContaining({
      code: 'PROVIDER_OUTPUT_INCOMPLETE',
      retryable: false,
    }))

    mockFetch(() => jsonResponse(response([], 'failed', {
      error: { code: 'content_filter', message: 'blocked' },
    })))
    const failed = await respondWithTools(env, provider, messages, [tool])
    expect(failed.finishReason).toBe('failed:content_filter')
    expect(() => assertActionableReply(failed)).toThrowError(expect.objectContaining({
      code: 'PROVIDER_ERROR',
      retryable: false,
    }))
  })

  it('rejects a completed response without a function call', async () => {
    mockFetch(() => jsonResponse(response([message('I cannot call tools.')])))
    const reply = await respondWithTools(env, provider, messages, [tool])
    expect(() => assertActionableReply(reply)).toThrowError(expect.objectContaining({
      code: 'PROVIDER_TOOL_UNSUPPORTED',
      retryable: false,
    }))
  })

  it('refuses to follow a redirect so the credential stays put', async () => {
    mockFetch(() => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }))
    await expect(respondWithTools(env, provider, messages, [tool])).rejects.toThrow(
      /redirected the request/,
    )
  })

  it('maps timeout, 408, 429 and 5xx as retryable but keeps other 4xx deterministic', async () => {
    mockFetch(() => {
      const error = new Error('The operation was aborted')
      error.name = 'TimeoutError'
      throw error
    })
    await expect(respondWithTools(env, provider, messages, [tool])).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
    })
    for (const status of [408, 429, 503]) {
      mockFetch(() => new Response('try later', { status }))
      await expect(respondWithTools(env, provider, messages, [tool])).rejects.toMatchObject({
        code: 'PROVIDER_ERROR',
        retryable: true,
      })
    }
    mockFetch(() => new Response('bad key', { status: 401 }))
    await expect(respondWithTools(env, provider, messages, [tool])).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: false,
    })
  })

  it('rejects non-JSON and non-Responses envelopes without retrying', async () => {
    mockFetch(() => new Response('<html>gateway</html>', { status: 200 }))
    await expect(respondWithTools(env, provider, messages, [tool])).rejects.toMatchObject({ retryable: false })
    mockFetch(() => jsonResponse({ unexpected: true }))
    await expect(respondWithTools(env, provider, messages, [tool])).rejects.toThrow(/Responses API schema/)
  })

  it('refuses to act without a configured endpoint', async () => {
    await expect(
      respondWithTools(env, { kind: 'none' }, messages, [tool]),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
  })
})

describe('workers-ai provider', () => {
  it('normalises the binding reply and synthesises call identifiers', async () => {
    const run = vi.fn().mockResolvedValue({
      response: 'ok',
      tool_calls: [{ name: 'assign', arguments: { memoryId: 'm1' } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })
    const reply = await respondWithTools(
      { ...env, AI: { run } as unknown as Ai },
      { kind: 'workers-ai', model: '@cf/example/tool-model' },
      messages,
      [tool],
      { maxOutputTokens: 4096 },
    )
    expect(run).toHaveBeenCalledWith('@cf/example/tool-model', expect.objectContaining({ max_tokens: 4096 }))
    expect(reply).toMatchObject({ status: 'completed', finishReason: 'completed' })
    expect(reply.toolCalls).toEqual([{ id: 'call_0', name: 'assign', arguments: { memoryId: 'm1' } }])
    expect(reply.usage).toEqual({ promptTokens: 3, completionTokens: 4 })
  })
  it('fails closed when the deployment has no AI binding', async () => {
    await expect(
      respondWithTools(env, { kind: 'workers-ai', model: 'm' }, messages, [tool]),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
  })
})

describe('connection probe', () => {
  it('requires a Responses function call', async () => {
    mockFetch(() => jsonResponse(response([functionCall('ping', '{"ok":true}', 'c')])))
    await expect(probeProvider(env, provider)).resolves.toEqual({
      reachable: true,
      modelOk: true,
      toolCallingOk: true,
      detail: 'The endpoint answered and called ping.',
    })

    mockFetch(() => jsonResponse(response([message('I cannot call tools.')])))
    const noTools = await probeProvider(env, provider)
    expect(noTools).toMatchObject({ reachable: true, modelOk: true, toolCallingOk: false })
    expect(noTools.detail).toContain('PROVIDER_TOOL_UNSUPPORTED')
  })
  it('never throws on a saved but unusable credential', async () => {
    mockFetch(() => new Response('nope', { status: 403 }))
    await expect(probeProvider(env, provider)).resolves.toMatchObject({ reachable: false })
    await expect(probeProvider(env, { kind: 'none' })).resolves.toMatchObject({
      reachable: false,
      detail: 'No model endpoint is configured.',
    })
  })
})
