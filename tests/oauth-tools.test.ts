import { expect, it } from 'vitest'
import { z } from 'zod'
import { mcp } from '../lib/server/mcp'
import { accessToken, fixture, jsonRpc, request, token } from './oauth-fixture'

it(
  'mcp oauth surface > advertises security schemes per tool and hides scopes a personal token lacks',
  async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', { secret: key, body: jsonRpc(1, 'tools/list') }),
      fixture.env,
    )
    const payload: unknown = await response.json()
    const body = z.looseObject(
      {
        result: z.looseObject(

          {

            tools: z.array(

              z.looseObject(

                {

                  name: z.string(),

                  securitySchemes: z.unknown(),

                  inputSchema: z.looseObject({ properties: z.record(z.string(), z.unknown()).optional() }),

                },

              ),

            ),

          },
        ),
      },
    )
      .parse(
        payload,
      )
    expect(body.result.tools.map(tool => tool.name)).toEqual([
      'memory_search',
      'memory_catalog_search',
      'memory_get',
      'memory_catalog',
    ])
    expect(body.result.tools[0]?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['memory:read'] },
    ])
  },
)

it('mcp oauth surface > searches the catalog through a structured MCP result', async () => {
  const key = await token(['memory:read'])
  const response = await mcp(
    request('/mcp', {
      secret: key,
      body: jsonRpc(1, 'tools/call', {
        name: 'memory_catalog_search',
        arguments: { query: 'database', project: 'global' },
      }),
    }),
    fixture.env,
  )
  expect(await response.json()).toMatchObject({
    result: {
      content: [
        { type: 'text' },
      ],
      structuredContent: { project: 'global', categories: [] },
    },
  })
})

it(
  'mcp oauth surface > advertises an output schema for every tool',
  async () => {
    const key = await token()
    const response = await mcp(
      request('/mcp', { secret: key, body: jsonRpc(1, 'tools/list') }),
      fixture.env,
    )
    const payload: unknown = await response.json()
    const body = z.looseObject(
      {
        result: z.looseObject(

          {

            tools: z.array(

              z.looseObject(

                {

                  name: z.string(),

                  outputSchema: z.looseObject(

                    { type: z.string().optional(), properties: z.record(z.string(), z.unknown()).optional() },

                  ),

                },

              ),

            ),

          },
        ),
      },
    )
      .parse(
        payload,
      )
    expect(body.result.tools.map(tool => tool.name)).toEqual([
      'memory_search',
      'memory_catalog_search',
      'memory_get',
      'memory_create',
      'memory_update',
      'memory_catalog',
    ])
    for (const tool of body.result.tools) {
      expect(tool.outputSchema.type).toBe('object')
      expect(Object.keys(tool.outputSchema.properties ?? {}).length).toBeGreaterThan(0)
    }
  },
)

it(
  'mcp oauth surface > returns structured content alongside the serialized JSON',
  async () => {
    const key = await token([
      'memory:read',
      'memory:write',
      'memory:delete',
    ])
    const created = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(1, 'tools/call', {
          name: 'memory_create',
          arguments: {
            project: 'global',
            title: 'Structured results',
            content: 'A tool call returns both a text block and structured data.',
            kind: 'fact',
            tags: [],
            source: 'Test suite.',
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      }),
      fixture.env,
    )
    const payload: unknown = await created.json()
    const body = structuredToolResult(payload)
    const text = z.looseObject({ id: z.string() }).parse(JSON.parse(body.result.content[0]?.text ?? '{}'))
    expect(body.result.structuredContent).toMatchObject({
      id: text.id,
      project: 'global',
      title: 'Structured results',
      version: 1,
      kind: 'fact',
      tags: [],
    })
    const removed = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_delete',
          arguments: { id: text.id, expectedVersion: 1 },
        }),
      }),
      fixture.env,
    )
    const removedPayload: unknown = await removed.json()
    expect(
      (z.looseObject({ result: z.looseObject({ structuredContent: z.unknown() }) }).parse(
        removedPayload,
      )).result
        .structuredContent,
    )
      .toEqual(
        { deleted: true },
      )
  },
)

it(
  'mcp oauth surface > returns a linking challenge when a personal token lacks the tool scope',
  async () => {
    const key = await token(['memory:read'])
    const response = await mcp(
      request('/mcp', {
        secret: key,
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_create',
          arguments: {
            project: 'global',
            title: 'Blocked write',
            content: 'A read-only link must not be able to save this.',
            kind: 'fact',
            tags: [],
            source: 'Test suite.',
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      }),
      fixture.env,
    )
    const payload: unknown = await response.json()
    const body = z.looseObject(
      {
        result: z.looseObject({ isError: z.boolean(), _meta: z.record(z.string(), z.unknown()).optional() }),
      },
    )
      .parse(
        payload,
      )
    expect(body.result.isError).toBe(true)
    const header = (z.array(z.string()).parse(body.result._meta?.['mcp/www_authenticate']))[0] ?? ''
    expect(header).toContain('error="insufficient_scope"')
    expect(header).toContain('scope="memory:write"')
    expect(
      await fixture.env.DB.prepare('SELECT count(*) AS n FROM memories').first('n'),
    ).toBe(0)
  },
)

it(
  'mcp oauth surface > serves personal tokens and Access JWTs on MCP',
  async () => {
    const secret = await token()
    const personal = await mcp(
      request('/mcp', {
        secret,
        body: jsonRpc(1, 'tools/call', {
          name: 'memory_search',
          arguments: { query: 'sqlc' },
        }),
      }),
      fixture.env,
    )
    expect(personal.status).toBe(200)
    accessToken('alice')
    const linked = await mcp(
      request('/mcp', {
        accessJwt: 'access.jwt',
        body: jsonRpc(2, 'tools/call', {
          name: 'memory_search',
          arguments: { query: 'sqlc' },
        }),
      }),
      fixture.env,
    )
    expect(linked.status).toBe(200)
    expect(
      fixture.usagePoints.some(
        point => typeof point.blobs?.[0] === 'string' && point.blobs[0].length > 0,
      ),
    )
      .toBe(
        true,
      )
    expect(await fixture.env.DB.prepare('SELECT count(*) AS n FROM usage_events').first('n')).toBe(
      0,
    )
  },
)

function structuredToolResult(payload: unknown): {
  result: {
    content: {
      type: string
      text: string
    }[]
    structuredContent: Record<string, unknown>
  }
} {
  const body = z.looseObject({
    result: z.looseObject({
      content: z.array(z.looseObject({ type: z.string(), text: z.string() })),
      structuredContent: z.record(z.string(), z.unknown()),
    }),
  }).parse(payload)
  return body
}
