import type { Env } from '../lib/server/env'
import type { ChatMessage, Provider, ToolSpec } from '../lib/server/llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../lib/server/errors'
import {
  chatWithTools,
  normalizeBaseUrl,
  probeProvider,
} from '../lib/server/llm'

const env: Env = { DB: undefined as unknown as D1Database, APP_ORIGIN: 'https://memory.example' }
const provider: Provider = {
  kind: 'openai-compatible',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-live-secret',
}
const tool: ToolSpec = {
  name: 'assign',
  description: 'Assign a memory to a category.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
}
const messages: ChatMessage[] = [{ role: 'user', content: 'Organize this batch.' }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function completion(message: unknown): unknown {
  return { choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 7 } }
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
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1/', false)).toBe(
      'https://openrouter.ai/api/v1',
    )
    expect(normalizeBaseUrl('  https://api.deepseek.com  ', false)).toBe('https://api.deepseek.com')
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

describe('openai-compatible provider', () => {
  it('sends the credential, the tools and a manual-redirect policy', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse(completion({ content: 'done', tool_calls: null })))
    await chatWithTools(env, provider, messages, [tool])
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-live-secret')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.model).toBe('deepseek-v4-flash')
    expect(body.tool_choice).toBe('auto')
    expect(body.temperature).toBe(0)
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'assign', description: tool.description, parameters: tool.parameters } },
    ])
  })
  it('omits tool fields when there are no tools', async () => {
    const fetchMock = mockFetch(() => jsonResponse(completion({ content: 'hi' })))
    await chatWithTools(env, provider, messages, [])
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
  })
  it('normalises tool calls, usage and stringified arguments', async () => {
    mockFetch(() =>
      jsonResponse(
        completion({
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'assign', arguments: '{"memoryId":"m1"}' } },
            { type: 'function', function: { name: 'skip', arguments: 'not json' } },
          ],
        }),
      ))
    const reply = await chatWithTools(env, provider, messages, [tool])
    expect(reply.content).toBeNull()
    expect(reply.usage).toEqual({ promptTokens: 11, completionTokens: 7 })
    expect(reply.toolCalls).toEqual([
      { id: 'call_1', name: 'assign', arguments: { memoryId: 'm1' } },
      // A missing identifier is synthesised so the loop can correlate the
      // result it feeds back, and unparseable arguments survive as a string.
      { id: 'call_1', name: 'skip', arguments: 'not json' },
    ])
  })
  it('renders an assistant tool call and its result in the provider dialect', async () => {
    const fetchMock = mockFetch(() => jsonResponse(completion({ content: 'ok' })))
    await chatWithTools(
      env,
      provider,
      [
        ...messages,
        { role: 'assistant', content: 'thinking', toolCalls: [{ id: 'call_9', name: 'assign', arguments: { a: 1 } }] },
        { role: 'tool', content: '{"applied":true}', toolCallId: 'call_9' },
      ],
      [tool],
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { messages: unknown[] }
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: 'thinking',
      tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'assign', arguments: '{"a":1}' } }],
    })
    expect(body.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_9',
      content: '{"applied":true}',
    })
  })
  it('refuses to follow a redirect so the credential stays put', async () => {
    mockFetch(() => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }))
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toThrow(
      /redirected the request/,
    )
  })
  it('maps an aborted request to a timeout', async () => {
    mockFetch(() => {
      const error = new Error('The operation was aborted')
      error.name = 'TimeoutError'
      throw error
    })
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
    })
  })
  it('reports the status and a bounded body when the provider fails', async () => {
    mockFetch(() => new Response('upstream said no', { status: 401 }))
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toThrow(/HTTP 401/)
  })
  it('rejects a body that is not JSON or not a completion', async () => {
    mockFetch(() => new Response('<html>gateway</html>', { status: 200 }))
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toThrow(/not JSON/)
    mockFetch(() => jsonResponse({ unexpected: true }))
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toThrow(
      /chat-completions schema/,
    )
    mockFetch(() => jsonResponse({ choices: [] }))
    await expect(chatWithTools(env, provider, messages, [tool])).rejects.toThrow(
      /chat-completions schema/,
    )
  })
  it('refuses to act without a configured endpoint', async () => {
    await expect(
      chatWithTools(env, { kind: 'none' }, messages, [tool]),
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
    const reply = await chatWithTools(
      { ...env, AI: { run } as unknown as Ai },
      { kind: 'workers-ai', model: '@cf/deepseek-ai/deepseek-v4-flash-0731' },
      messages,
      [tool],
    )
    expect(run).toHaveBeenCalledOnce()
    expect(reply.toolCalls).toEqual([{ id: 'call_0', name: 'assign', arguments: { memoryId: 'm1' } }])
    expect(reply.usage).toEqual({ promptTokens: 3, completionTokens: 4 })
  })
  it('fails closed when the deployment has no AI binding', async () => {
    await expect(
      chatWithTools(env, { kind: 'workers-ai', model: 'm' }, messages, [tool]),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
  })
})

describe('connection probe', () => {
  it('reports success when the model calls the probe tool', async () => {
    mockFetch(() =>
      jsonResponse(completion({ content: null, tool_calls: [{ id: 'c', function: { name: 'ping', arguments: '{"ok":true}' } }] })))
    const result = await probeProvider(env, provider)
    expect(result).toEqual({
      reachable: true,
      modelOk: true,
      toolCallingOk: true,
      detail: 'The endpoint answered and called ping.',
    })
  })
  it('separates "reachable but no tool support" from "unreachable"', async () => {
    mockFetch(() => jsonResponse(completion({ content: 'I cannot call tools.' })))
    const noTools = await probeProvider(env, provider)
    expect(noTools).toMatchObject({ reachable: true, modelOk: true, toolCallingOk: false })
    expect(noTools.detail).toContain('without calling the tool')

    mockFetch(() => new Response('bad key', { status: 401 }))
    const broken = await probeProvider(env, provider)
    expect(broken).toMatchObject({ reachable: false, modelOk: false, toolCallingOk: false })
    expect(broken.detail).toContain('HTTP 401')
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
