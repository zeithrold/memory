import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { call, stubProvider } from './catalog-api-fixture'

it(
  'connection probe > keeps the explanation of a failed stored probe, and clears it on the next success',
  async () => {
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'responses-api',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => await Promise.resolve(new Response('bad key', { status: 401 }))),
    )
    await call('/api/v1/catalog/settings/test', 'POST', {})
    const failed = await call('/api/v1/catalog/settings')
    expect(failed.body).toMatchObject({ lastProbeOk: false })
    expect(z.string().parse(failed.body?.lastProbeError)).toContain('HTTP 401')

    stubProvider()
    await call('/api/v1/catalog/settings/test', 'POST', {})
    const recovered = await call('/api/v1/catalog/settings')
    expect(recovered.body).toMatchObject({ lastProbeOk: true, lastProbeError: null })
  },
)

it(
  'connection probe > clears a stale probe when the provider configuration changes',
  async () => {
    stubProvider()
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'responses-api',
      baseUrl: 'https://api.example.com',
      model: 'first-model',
      apiKey: 'sk-live-0123456789abcdef',
    })
    await call('/api/v1/catalog/settings/test', 'POST', {})
    expect((await call('/api/v1/catalog/settings')).body).toMatchObject({ lastProbeOk: true })

    const changed = await call('/api/v1/catalog/settings', 'PUT', { model: 'second-model' })
    expect(changed.body).toMatchObject({
      lastProbeAt: null,
      lastProbeOk: null,
      lastProbeError: null,
    })
  },
)

it(
  'connection probe > reuses the stored credential when the form only changes the model',
  async () => {
    stubProvider()
    await call('/api/v1/catalog/settings', 'PUT', {
      provider: 'responses-api',
      baseUrl: 'https://api.example.com',
      model: 'm',
      apiKey: 'sk-live-0123456789abcdef',
    })
    const { status, body } = await call('/api/v1/catalog/settings/test', 'POST', {
      provider: 'responses-api',
      baseUrl: 'https://api.example.com',
      model: 'another-model',
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ reachable: true })
    const sent = z.looseObject({ headers: z.record(z.string(), z.string()) }).parse(
      vi.mocked(fetch).mock.calls[0]?.[1],
    )
    expect((z.record(z.string(), z.string()).parse(sent.headers)).Authorization).toBe(
      'Bearer sk-live-0123456789abcdef',
    )
  },
)

it('connection probe > reports an unconfigured account instead of erroring', async () => {
  const { status, body } = await call('/api/v1/catalog/settings/test', 'POST', {})
  expect(status).toBe(200)
  expect(body).toMatchObject({ reachable: false, detail: 'No model endpoint is configured.' })
})

it(
  'connection probe > rejects an unsupported method on an explicit catalog route',
  async () => {
    const { status, body } = await call('/api/v1/catalog/settings', 'PATCH', {})
    expect(status).toBe(405)
    expect(body).toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
  },
)
