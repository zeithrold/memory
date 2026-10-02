import { expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from '../lib/server/errors'
import {
  assertActionableReply,
  normalizeBaseUrl,
  respondWithTools,
} from '../lib/server/llm'
import {
  env,
  functionCall,
  jsonResponse,
  message,
  messages,
  mockFetch,
  provider,
  response,
  tool,
} from './llm-fixture'

it(
  'base URL normalisation > keeps a provider version path and drops trailing slashes',
  () => {
    expect(normalizeBaseUrl('https://api.example.com/v1/', false)).toBe(
      'https://api.example.com/v1',
    )
    expect(normalizeBaseUrl('  https://api.example.com  ', false)).toBe('https://api.example.com')
  },
)

it(
  'base URL normalisation > requires HTTPS except for a loopback host outside production',
  () => {
    expect(() => normalizeBaseUrl('http://api.example.com', false)).toThrow(AppError)
    expect(() => normalizeBaseUrl('http://localhost:11434', false)).toThrow(/HTTPS/)
    expect(normalizeBaseUrl('http://localhost:11434/', true)).toBe('http://localhost:11434')
    expect(normalizeBaseUrl('http://127.0.0.1:8080', true)).toBe('http://127.0.0.1:8080')
  },
)

it(
  'base URL normalisation > rejects a query string, a fragment and a non-URL',
  () => {
    expect(() => normalizeBaseUrl('https://api.example.com?key=1', false)).toThrow(/query string/)
    expect(() => normalizeBaseUrl('https://api.example.com#x', false)).toThrow(/query string/)
    expect(() => normalizeBaseUrl('not a url', false)).toThrow(/not a valid URL/)
    expect(() => normalizeBaseUrl('   ', false)).toThrow(/Enter a model endpoint/)
  },
)

it(
  'responses API provider > posts the required Responses fields and refuses redirects',
  async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(response([
        functionCall('assign', '{}', 'call_1'),
      ])))
    await respondWithTools(
      env,
      provider,
      { messages, tools: [tool], options: { maxOutputTokens: 4096 } },
    )
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.example.com/v1/responses')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect((z.record(z.string(), z.string()).parse(init?.headers)).Authorization).toBe(
      'Bearer sk-live-secret',
    )
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(z.string().parse(init?.body)))
    expect(body).toMatchObject({
      model: 'catalog-model',
      instructions: 'Use tools only.',
      reasoning: { effort: 'none' },
      tool_choice: 'required',
      max_output_tokens: 4096,
    })
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [
        { type: 'input_text', text: 'Organize this batch.' },
      ] },
    ])
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'assign',
        description: tool.description,
        parameters: tool.parameters,
      },
    ])
    expect(body).not.toHaveProperty('temperature')
  },
)

it(
  'responses API provider > omits tool fields when there are no tools',
  async () => {
    const fetchMock = mockFetch(() => jsonResponse(response([
      message('hi'),
    ])))
    await respondWithTools(env, provider, { messages, tools: [] })
    const body = z.record(z.string(), z.unknown()).parse(
      JSON.parse(z.string().parse(fetchMock.mock.calls[0]?.[1]?.body)),
    )
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
  },
)

it(
  'responses API provider > extracts text, multiple function calls, usage and malformed arguments safely',
  async () => {
    mockFetch(() => jsonResponse(response([
      { type: 'reasoning', id: 'reasoning_1', summary: [] },
      message('working'),
      functionCall('assign', '{"memoryId":"m1"}', 'call_1'),
      functionCall('skip', 'not json'),
    ])))
    const reply = await respondWithTools(env, provider, { messages, tools: [tool] })
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
  },
)

it(
  'responses API provider > rebuilds prior function calls and outputs without a previous response id',
  async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(response([
        functionCall('assign', '{}', 'call_10'),
      ])))
    await respondWithTools(
      env,
      provider,
      { messages: [
        ...messages,
        { role: 'assistant', content: 'thinking', toolCalls: [
          { id: 'call_9', name: 'assign', arguments: { a: 1 } },
        ] },
        { role: 'tool', content: '{"applied":true}', toolCallId: 'call_9' },
      ], tools: [tool] },
    )
    const body = z.looseObject({ input: z.array(z.unknown()) }).parse(
      JSON.parse(z.string().parse(fetchMock.mock.calls[0]?.[1]?.body)),
    )
    expect(body.input.slice(1)).toEqual([
      { type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: 'thinking' },
      ] },
      { type: 'function_call', call_id: 'call_9', name: 'assign', arguments: '{"a":1}' },
      { type: 'function_call_output', call_id: 'call_9', output: '{"applied":true}' },
    ])
    expect(body).not.toHaveProperty('previous_response_id')
  },
)

it(
  'responses API provider > preserves incomplete and failed terminal states for the caller guard',
  async () => {
    mockFetch(() => jsonResponse(response([], 'incomplete', {
      incomplete_details: { reason: 'max_output_tokens' },
    })))
    const incomplete = await respondWithTools(env, provider, { messages, tools: [tool] })
    expect(incomplete.finishReason).toBe('incomplete:max_output_tokens')
    expect(() => assertActionableReply(incomplete)).toThrow(expect.objectContaining({
      code: 'PROVIDER_OUTPUT_INCOMPLETE',
      retryable: false,
    }))

    mockFetch(() => jsonResponse(response([], 'failed', {
      error: { code: 'content_filter', message: 'blocked' },
    })))
    const failed = await respondWithTools(env, provider, { messages, tools: [tool] })
    expect(failed.finishReason).toBe('failed:content_filter')
    expect(() => assertActionableReply(failed)).toThrow(expect.objectContaining({
      code: 'PROVIDER_ERROR',
      retryable: false,
    }))
  },
)

it(
  'responses API provider > rejects a completed response without a function call',
  async () => {
    mockFetch(() => jsonResponse(response([
      message('I cannot call tools.'),
    ])))
    const reply = await respondWithTools(env, provider, { messages, tools: [tool] })
    expect(() => assertActionableReply(reply)).toThrow(expect.objectContaining({
      code: 'PROVIDER_TOOL_UNSUPPORTED',
      retryable: false,
    }))
  },
)

it(
  'responses API provider > refuses to follow a redirect so the credential stays put',
  async () => {
    mockFetch(
      () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
    )
    await expect(respondWithTools(env, provider, { messages, tools: [tool] })).rejects.toThrow(
      /redirected the request/,
    )
  },
)

it(
  'responses API provider > maps timeout, 408, 429 and 5xx as retryable but keeps other 4xx deterministic',
  async () => {
    mockFetch(() => {
      const error = new Error('The operation was aborted')
      error.name = 'TimeoutError'
      throw error
    })
    await expect(respondWithTools(env, provider, { messages, tools: [tool] })).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
    })
    for (const status of [
      408,
      429,
      503,
    ]) {
      mockFetch(() => new Response('try later', { status }))
      await expect(respondWithTools(env, provider, { messages, tools: [tool] })).rejects.toMatchObject({
        code: 'PROVIDER_ERROR',
        retryable: true,
      })
    }
    mockFetch(() => new Response('bad key', { status: 401 }))
    await expect(respondWithTools(env, provider, { messages, tools: [tool] })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: false,
    })
  },
)

it(
  'responses API provider > rejects non-JSON and non-Responses envelopes without retrying',
  async () => {
    mockFetch(() => new Response('<html>gateway</html>', { status: 200 }))
    await expect(respondWithTools(env, provider, { messages, tools: [
      tool,
    ] })).rejects.toMatchObject({ retryable: false })
    mockFetch(() => jsonResponse({ unexpected: true }))
    await expect(respondWithTools(env, provider, { messages, tools: [tool] })).rejects.toThrow(
      /Responses API schema/,
    )
  },
)

it('responses API provider > refuses to act without a configured endpoint', async () => {
  await expect(
    respondWithTools(env, { kind: 'none' }, { messages, tools: [tool] }),
  ).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
})
