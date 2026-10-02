import type { Env } from '../lib/server/env'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { environmentFromOrigin, TRACES_SAMPLE_RATE } from '../lib/observability'
import { AppError, errorResponse, problemDocument } from '../lib/server/errors'
import {
  captureRequestError,
  scrubEvent,
  scrubTransaction,
  sentryEnvironment,
  sentryOptions,
  sentryRelease,
  traceRate,
} from '../lib/server/observability'
import { database } from './database'

const { captureException, setUser, setTag, init } = vi.hoisted(() => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  init: vi.fn(),
}))

vi.mock('@sentry/cloudflare', () => ({
  withSentry: (_options: unknown, handler: unknown) => handler,
  wrapMcpServerWithSentry: (server: unknown) => server,
  captureException,
  setUser,
  setTag,
  init,
  withScope: (callback: (scope: unknown) => void) =>
    callback({ setTag: vi.fn() }),
}))

const store = database()

const stage: Env = { DB: store.db, APP_ORIGIN: 'http://localhost:3000' }

const production: Env = {
  DB: store.db,
  APP_ORIGIN: 'https://memory.ztd.me',
}

const context = { origin: 'https://memory.example', instance: '/api/v1/memories', method: 'POST' }

beforeEach(() => {
  captureException.mockReset()
  setUser.mockReset()
  setTag.mockReset()
  delete process.env.SENTRY_RELEASE
})

afterAll(() => {
  store.sqlite.close()
})
it('environment detection > treats http origins and localhost as stage', () => {
  expect(environmentFromOrigin('http://localhost:3000')).toBe('stage')
  expect(environmentFromOrigin('http://127.0.0.1:3100')).toBe('stage')
  expect(environmentFromOrigin('https://localhost')).toBe('stage')
})

it(
  'environment detection > treats every deployment as production, including unknown origins',
  () => {
    expect(environmentFromOrigin('https://memory.ztd.me')).toBe('production')
    expect(environmentFromOrigin('https://memory-staging.example.com')).toBe(
      'production',
    )
    expect(environmentFromOrigin('not a url')).toBe('production')
    expect(sentryEnvironment(production)).toBe('production')
    expect(sentryEnvironment(stage)).toBe('stage')
  },
)

it('environment detection > lets an explicit environment win', () => {
  expect(sentryEnvironment({ ...stage, SENTRY_ENVIRONMENT: 'production' })).toBe(
    'production',
  )
  expect(
    sentryEnvironment({ ...production, SENTRY_ENVIRONMENT: ' stage ' }),
  ).toBe('stage')
  expect(sentryEnvironment({ ...production, SENTRY_ENVIRONMENT: 'nonsense' })).toBe(
    'production',
  )
})

it('trace sampling > samples everything on stage and half in production', () => {
  expect(traceRate(stage)).toBe(1)
  expect(traceRate(production)).toBe(0.5)
  expect(TRACES_SAMPLE_RATE).toEqual({ stage: 1, production: 0.5 })
})

it('trace sampling > honours a valid override and ignores a broken one', () => {
  expect(traceRate({ ...production, SENTRY_TRACES_SAMPLE_RATE: '0.25' })).toBe(0.25)
  expect(traceRate({ ...stage, SENTRY_TRACES_SAMPLE_RATE: '0' })).toBe(0)
  for (const value of [
    'abc',
    '5',
    '-1',
    '',
  ]) {
    expect(traceRate({ ...production, SENTRY_TRACES_SAMPLE_RATE: value })).toBe(0.5)
    expect(traceRate({ ...stage, SENTRY_TRACES_SAMPLE_RATE: value })).toBe(1)
  }
})

it('sentry options > stays inert without a DSN', () => {
  expect(sentryOptions(stage)).toBeUndefined()
  expect(sentryOptions({ ...production, SENTRY_DSN: '   ' })).toBeUndefined()
})

it('sentry options > never sends PII and never widens data collection', () => {
  const options = sentryOptions({
    ...production,
    SENTRY_DSN: 'https://key@sentry.example/1',
    SENTRY_RELEASE: 'abc123',
  })
  expect(options).toMatchObject({
    dsn: 'https://key@sentry.example/1',
    environment: 'production',
    release: 'abc123',
    tracesSampleRate: 0.5,
    sendDefaultPii: false,
  })
  // Passing `dataCollection` would reset unspecified fields to permissive defaults.
  expect(options).not.toHaveProperty('dataCollection')
  expect(options?.beforeSend).toBeTypeOf('function')
  expect(options?.beforeSendTransaction).toBeTypeOf('function')
})

it('sentry options > falls back to the build-time release', () => {
  process.env.SENTRY_RELEASE = 'built-sha'
  expect(sentryRelease({})).toBe('built-sha')
  expect(sentryRelease({ SENTRY_RELEASE: 'explicit' })).toBe('explicit')
  expect(sentryRelease({ SENTRY_RELEASE: '' })).toBe('built-sha')
  delete process.env.SENTRY_RELEASE
  expect(sentryRelease({})).toBeUndefined()
})

it('event scrubbing > removes memory text, credentials and query strings', () => {
  const event: Parameters<typeof scrubEvent>[0] = {
    type: undefined,
    request: {
      url: 'https://memory.example/api/v1/search?query=my+secret+project',
      query_string: 'query=my+secret+project',
      data: { content: 'Prefer sqlc over an ORM.' },
      cookies: { session: 'jwt' },
      headers: {
        'Authorization': 'Bearer mem_deadbeef',
        'Cookie': 'session=jwt',
        'X-Api-Key': 'key',
        'Content-Type': 'application/json',
      },
    },
    user: {
      id: 'user_1',
      email: 'someone@example.com',
      username: 'someone',
      ip_address: '203.0.113.7',
      name: 'Someone',
    },
    extra: { note: 'kept' },
    breadcrumbs: [
      {
        message: 'https://memory.example/api/v1/search?query=secret',
        data: { url: 'https://memory.example/x?q=1' },
      },
    ],
  }
  // scrubEvent mutates in place, so the fixture itself is the assertion target.
  scrubEvent(event)
  expect(event.request?.url).toBe('https://memory.example/api/v1/search')
  expect(event.request).not.toHaveProperty('query_string')
  expect(event.request).not.toHaveProperty('data')
  expect(event.request).not.toHaveProperty('cookies')
  expect(event.request?.headers).toEqual({ 'Content-Type': 'application/json' })
  expect(event.user).toEqual({ id: 'user_1' })
  expect(event.extra).toEqual({ note: 'kept' })
  expect(event.breadcrumbs?.[0]?.message).toBe(
    'https://memory.example/api/v1/search',
  )
  expect(event.breadcrumbs?.[0]?.data).toEqual({
    url: 'https://memory.example/x?q=1',
  })
})

it('event scrubbing > drops genAI content attributes but keeps usage counts', () => {
  const event: Parameters<typeof scrubTransaction>[0] = {
    timestamp: 0,
    start_timestamp: 0,
    type: 'transaction',
    spans: [
      {
        span_id: '1234567890123456',
        trace_id: '12345678901234567890123456789012',
        start_timestamp: 0,
        timestamp: 1,
        data: {
          'gen_ai.embeddings.input': 'Database access preference\nPrefer sqlc.',
          'gen_ai.input.messages': '[]',
          'gen_ai.system_instructions': 'system',
          'gen_ai.usage.input_tokens': 12,
          'gen_ai.request.model': '@cf/baai/bge-m3',
        },
      },
    ],
    transaction: 'POST /mcp',
  }
  expect(
    scrubTransaction(event),
  ).not.toBeNull()
  expect(event.spans?.[0]?.data).toEqual({
    'gen_ai.usage.input_tokens': 12,
    'gen_ai.request.model': '@cf/baai/bge-m3',
  })
})

it(
  'event scrubbing > drops documentation and discovery transactions',
  () => {
    for (const transaction of ['GET /.well-known/oauth-protected-resource', 'GET /errors/[slug]']) {
      expect(
        scrubTransaction({ transaction, timestamp: 1, start_timestamp: 0, type: 'transaction' }),
      )
        .toBeNull()
    }
    expect(
      scrubTransaction(
        { transaction: 'POST /api/v1/memories', timestamp: 1, start_timestamp: 0, type: 'transaction' },
      ),
    )
      .not
      .toBeNull()
  },
)

it('error reporting > reports server failures with the problem code and method', () => {
  captureRequestError(
    new Error('D1_ERROR'),
    problemDocument('INTERNAL_ERROR', 'Failed.', context),
    context,
  )
  expect(captureException).toHaveBeenCalledTimes(1)
})

it('error reporting > ignores client errors', () => {
  for (const code of [
    'UNAUTHORIZED',
    'RATE_LIMITED',
    'VERSION_CONFLICT',
  ] as const) {
    captureRequestError(
      new Error('client'),
      problemDocument(code, 'Expected.', context),
      context,
    )
  }
  expect(captureException).not.toHaveBeenCalled()
})

it('error reporting > reports through the problem response path only for 5xx', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  errorResponse(new Error('boom'), context)
  expect(captureException).toHaveBeenCalledTimes(1)
  captureException.mockReset()
  const response = errorResponse(new AppError('FORBIDDEN', 'Nope.'), context)
  expect(captureException).not.toHaveBeenCalled()
  expect(response.status).toBe(403)
  logged.mockRestore()
})
