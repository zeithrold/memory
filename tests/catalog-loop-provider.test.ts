import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { updateCatalogSettings } from '../lib/server/catalog/settings'
import { actTurn, thinkTurn } from '../lib/server/catalog/turn'
import { API_KEY, calls, fixture, input, prose, script, seedCategory, terminalFailure } from './catalog-loop-fixture'

it(
  'the agent loop > records and replays a completed response without tools as a terminal failure',
  async () => {
    const mock = script(prose('I have nothing to add.'))
    await expect(thinkTurn(input())).rejects.toMatchObject({
      code: 'PROVIDER_TOOL_UNSUPPORTED',
      retryable: false,
    })
    await expect(thinkTurn(input())).rejects.toMatchObject({
      code: 'PROVIDER_TOOL_UNSUPPORTED',
      retryable: false,
    })
    expect(mock).toHaveBeenCalledTimes(1)
    expect(
      await fixture.env.DB.prepare('SELECT finish_reason FROM catalog_turns').first('finish_reason'),
    )
      .toBe(
        'completed',
      )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_actions').first('n'))
      .toBe(
        0,
      )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_skips').first('n')).toBe(
      0,
    )
  },
)

it(
  'the agent loop > records incomplete usage and replays the same error without another paid call',
  async () => {
    const mock = script(terminalFailure('incomplete', 'max_output_tokens'))
    await expect(thinkTurn(input())).rejects.toMatchObject({
      code: 'PROVIDER_OUTPUT_INCOMPLETE',
      retryable: false,
    })
    await expect(thinkTurn(input())).rejects.toMatchObject({
      code: 'PROVIDER_OUTPUT_INCOMPLETE',
      retryable: false,
    })
    expect(mock).toHaveBeenCalledTimes(1)
    expect(await fixture.env.DB.prepare(
      'SELECT finish_reason, prompt_tokens, completion_tokens FROM catalog_turns',
    ).first()).toEqual({
      finish_reason: 'incomplete:max_output_tokens',
      prompt_tokens: 70,
      completion_tokens: 19,
    })
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_actions').first('n'))
      .toBe(
        0,
      )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_skips').first('n')).toBe(
      0,
    )
  },
)

it(
  'the agent loop > records and replays a provider-declared failed response',
  async () => {
    const mock = script(terminalFailure('failed', 'content_filter'))
    await expect(thinkTurn(input())).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: false })
    await expect(thinkTurn(input())).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: false })
    expect(mock).toHaveBeenCalledTimes(1)
    expect(
      await fixture.env.DB.prepare('SELECT finish_reason FROM catalog_turns').first('finish_reason'),
    )
      .toBe(
        'failed:content_filter',
      )
  },
)

it(
  'the agent loop > keeps the Workers AI no-tool stall behavior unchanged',
  async () => {
    await updateCatalogSettings(fixture.env, 'alice', {
      provider: 'workers-ai',
      model: '@cf/example/tool-model',
    })
    const run = vi.fn().mockResolvedValue({
      response: 'Nothing to change.',
      tool_calls: [],
      usage: { prompt_tokens: 8, completion_tokens: 3 },
    })
    fixture.env.AI = { run }

    await expect(thinkTurn(input())).resolves.toMatchObject({
      noToolCalls: true,
      toolCallCount: 0,
      provider: 'workers-ai',
    })
    await expect(actTurn(input(), 0)).resolves.toMatchObject({
      stalled: true,
      finished: false,
    })
    expect(
      await fixture.env.DB.prepare('SELECT finish_reason FROM catalog_turns').first('finish_reason'),
    )
      .toBe(
        'stop',
      )
  },
)

it(
  'the agent loop > truncates a turn that exceeds the tool-call budget',
  async () => {
    const categoryId = await seedCategory('backend', 'Backend')
    script(calls(
      Array.from({ length: 11 }, (_, index) => ({
        name: 'assign',
        arguments: {
          memoryId: fixture.memoryIds[index % fixture.memoryIds.length],
          categoryId,
          confidence: 0.9,
          reason: 'Budget.',
        },
      })),
    ))
    await thinkTurn(input())
    const acted = await actTurn(input({ maxToolCalls: 8 }), 0)
    expect(acted.applied).toBe(8)
    expect(acted.rejected).toBe(3)
    expect(acted.stalled).toBe(true)
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM catalog_actions').first('n'))
      .toBe(
        11,
      )
    const results = z.array(z.looseObject({ toolCallId: z.string() })).parse(
      JSON.parse(
        await fixture.env.DB.prepare('SELECT tool_results_json FROM catalog_turns').first<string>(
          'tool_results_json',
        )
        ?? '[]',
      ),
    )
    expect(results).toHaveLength(11)
    expect(new Set(results.map(result => result.toolCallId)).size).toBe(11)
  },
)

it(
  'the agent loop > keeps the credential and the batch bodies out of the step result',
  async () => {
    script(calls([
      { name: 'finish', arguments: { summary: 'Done.' } },
    ]))
    const thought = await thinkTurn(input())
    const serialized = JSON.stringify(thought)
    // Step results are persisted as instance state, retained for days, so a
    // decrypted key must never appear in one.
    expect(serialized).not.toContain(API_KEY)
    expect(serialized).not.toContain('sk-live')
    expect(serialized).not.toContain('Prefer sqlc and pgx')
  },
)

it('the agent loop > refuses to run without a configured provider', async () => {
  await fixture.env.DB.prepare('DELETE FROM agent_settings').run()
  await expect(thinkTurn(input())).rejects.toMatchObject({ code: 'AGENT_NOT_CONFIGURED' })
})

it(
  'the agent loop > marks deterministic provider failures non-retryable and timeouts retryable',
  async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => await Promise.resolve(new Response('bad request', { status: 400 }))),
    )
    await expect(thinkTurn(input())).rejects.toMatchObject({ retryable: false })

    vi.stubGlobal('fetch', vi.fn(() => {
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      throw error
    }))
    await expect(thinkTurn(input({ turn: 1 }))).rejects.toMatchObject({ retryable: true })
  },
)
