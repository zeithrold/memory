import { expect, it, vi } from 'vitest'
import {
  probeProvider,
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
  'workers-ai provider > normalises the binding reply and synthesises call identifiers',
  async () => {
    const run = vi.fn().mockResolvedValue({
      response: 'ok',
      tool_calls: [
        { name: 'assign', arguments: { memoryId: 'm1' } },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })
    const reply = await respondWithTools(
      { ...env, AI: { run } },
      { kind: 'workers-ai', model: '@cf/example/tool-model' },
      { messages, tools: [tool], options: { maxOutputTokens: 4096 } },
    )
    expect(run).toHaveBeenCalledWith(
      '@cf/example/tool-model',
      expect.objectContaining({ max_tokens: 4096 }),
    )
    expect(reply).toMatchObject({ status: 'completed', finishReason: 'completed' })
    expect(reply.toolCalls).toEqual([
      { id: 'call_0', name: 'assign', arguments: { memoryId: 'm1' } },
    ])
    expect(reply.usage).toEqual({ promptTokens: 3, completionTokens: 4 })
  },
)

it('workers-ai provider > fails closed when the deployment has no AI binding', async () => {
  await expect(
    respondWithTools(
      env,
      { kind: 'workers-ai', model: 'm' },
      { messages, tools: [tool] },
    ),
  ).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
})

it('connection probe > requires a Responses function call', async () => {
  mockFetch(() => jsonResponse(response([
    functionCall('ping', '{"ok":true}', 'c'),
  ])))
  await expect(probeProvider(env, provider)).resolves.toEqual({
    reachable: true,
    modelOk: true,
    toolCallingOk: true,
    detail: 'The endpoint answered and called ping.',
  })

  mockFetch(() => jsonResponse(response([
    message('I cannot call tools.'),
  ])))
  const noTools = await probeProvider(env, provider)
  expect(noTools).toMatchObject({ reachable: true, modelOk: true, toolCallingOk: false })
  expect(noTools.detail).toContain('PROVIDER_TOOL_UNSUPPORTED')
})

it('connection probe > never throws on a saved but unusable credential', async () => {
  mockFetch(() => new Response('nope', { status: 403 }))
  await expect(probeProvider(env, provider)).resolves.toMatchObject({ reachable: false })
  await expect(probeProvider(env, { kind: 'none' })).resolves.toMatchObject({
    reachable: false,
    detail: 'No model endpoint is configured.',
  })
})
