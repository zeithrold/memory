import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApi, ProblemError } from '../components/api-client'

const t = { signIn: 'Sign in.', loadError: 'Loading failed.' }

const valueSchema = z.looseObject({ value: z.string() })

afterEach(() => vi.unstubAllGlobals())
it(
  'keeps browser API calls on the session cookie and accepts Headers inputs',
  async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ value: 'saved', extra: true }))
    vi.stubGlobal('fetch', fetcher)
    const result = await createApi('ready', t)('status', valueSchema, {
      headers: new Headers({ 'X-Request-ID': 'request-1' }),
    })
    expect(result).toEqual({ value: 'saved', extra: true })
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/status')
    expect(init?.credentials).toBe('include')
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Request-ID')).toBe('request-1')
    expect(headers.get('Content-Type')).toBe('application/json')
  },
)

it('fails closed before fetching when the browser has no configured session', async () => {
  const fetcher = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetcher)
  await expect(createApi('unconfigured', t)('status', valueSchema)).rejects.toThrow(t.signIn)
  expect(fetcher).not.toHaveBeenCalled()
})

it('rejects a malformed success response at the API boundary', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ value: 42 })))
  await expect(createApi('ready', t)('status', valueSchema)).rejects.toBeInstanceOf(z.ZodError)
})

it('preserves the machine error code and explanation of a problem response', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    code: 'SESSION_REQUIRED',
    detail: 'Use a browser session.',
  }, { status: 403 })))
  await expect(createApi('ready', t)('status', valueSchema)).rejects.toEqual(
    new ProblemError('Use a browser session.', 'SESSION_REQUIRED'),
  )
})

it(
  'accepts an empty successful response when the operation returns no data',
  async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })),
    )
    await expect(createApi('ready', t)('tokens/retired', z.unknown(), { method: 'DELETE' })).resolves.toBeUndefined()
  },
)
