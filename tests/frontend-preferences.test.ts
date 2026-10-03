import { expect, it } from 'vitest'
import { preferenceCookie, serializePreferences } from '@/components/ui/ztd-me'
import { memoryFrontendBootstrap, memoryPreferencePolicy } from '../lib/frontend-preferences'

const production = 'https://memory.ztd.me'
const development = 'http://localhost:3100'
const selection = { version: 1, mode: 'dark', palette: 'ocean', locale: 'zh-CN' } as const

it('shares only the explicit production origin and isolates HTTPS previews', () => {
  expect(memoryPreferencePolicy(production)).toEqual({
    name: 'ztd.frontend.v1',
    domain: 'ztd.me',
    secure: true,
    mirrorKey: 'ztd.frontend.v1',
  })
  expect(memoryPreferencePolicy('https://preview.memory.ztd.me')).toEqual({
    name: 'ztd.frontend.preview.memory.v1',
    secure: true,
    mirrorKey: 'ztd.frontend.preview.memory.v1',
  })
  expect(memoryPreferencePolicy(development)).toEqual({
    name: 'ztd.frontend.development.memory.v1',
    secure: false,
    mirrorKey: 'ztd.frontend.development.memory.v1',
  })
  expect(memoryPreferencePolicy('https://memory.ztd.me.example.com').domain).toBeUndefined()
})

it('writes only the explicitly configured production domain and host-only isolated policies', () => {
  const value = serializePreferences(selection)
  expect(preferenceCookie(selection, memoryPreferencePolicy(production))).toBe(
    `ztd.frontend.v1=${value}; Path=/; SameSite=Lax; Max-Age=31536000; Domain=ztd.me; Secure`,
  )
  expect(preferenceCookie(selection, memoryPreferencePolicy('https://preview.memory.ztd.me'))).toBe(
    `ztd.frontend.preview.memory.v1=${value}; Path=/; SameSite=Lax; Max-Age=31536000; Secure`,
  )
  expect(preferenceCookie(selection, memoryPreferencePolicy(development))).toBe(
    `ztd.frontend.development.memory.v1=${value}; Path=/; SameSite=Lax; Max-Age=31536000`,
  )
})

it('preserves a valid shared selection over the old host locale', () => {
  const cookie = `ztd.frontend.v1=${serializePreferences(selection)}; locale=en`
  expect(memoryFrontendBootstrap(production, cookie, 'en').initialPreferences).toEqual(selection)
})

it.each([
  'locale=zh-CN',
  'ztd.frontend.development.memory.v1=broken; locale=zh-CN',
  'ztd.frontend.development.memory.v1=%7B%22version%22%3A2%7D; locale=zh-CN',
])(
  'ignores retired locale preferences when the current cookie is missing, invalid or future: %s',
  (cookie) => {
    expect(memoryFrontendBootstrap(development, cookie, 'en').initialPreferences).toEqual({
      version: 1,
      mode: 'system',
      palette: 'neutral',
      locale: 'en',
    })
  },
)

it('negotiates locale, ignores production cookies in previews and discards private data', () => {
  const withPrivateData = { ...selection, auth: 'secret', account: 'alice', draft: 'private' }
  const cookie = `ztd.frontend.v1=${encodeURIComponent(JSON.stringify(withPrivateData))}`
  expect(memoryFrontendBootstrap(production, cookie, 'en').initialPreferences).toEqual(selection)
  expect(memoryFrontendBootstrap('https://preview.memory.ztd.me', cookie, 'en').initialPreferences.locale).toBe('en')
  expect(memoryFrontendBootstrap(development, cookie, 'zh-CN,en;q=0.5').initialPreferences).toEqual({
    version: 1,
    mode: 'system',
    palette: 'neutral',
    locale: 'zh-CN',
  })
})

it('preserves each existing current-format selection without reading another environment cookie', () => {
  for (const origin of [
    production,
    'https://preview.memory.ztd.me',
    development,
  ]) {
    const policy = memoryPreferencePolicy(origin)
    const cookie = `${policy.name}=${serializePreferences(selection)}`
    expect(memoryFrontendBootstrap(origin, cookie, 'en').initialPreferences).toEqual(selection)
  }
  const previewCookie = `ztd.frontend.preview.memory.v1=${serializePreferences(selection)}`
  expect(memoryFrontendBootstrap(production, previewCookie, 'en').initialPreferences.locale).toBe('en')
  expect(memoryFrontendBootstrap(development, previewCookie, 'en').initialPreferences.locale).toBe('en')
})

it.each([
  '%7B',
  '%7B%22version%22%3A2%7D',
  'x'.repeat(1025),
])(
  'falls back deterministically for malformed, future or oversized cookies: %s',
  (value) => {
    const cookie = `ztd.frontend.v1=${value}`
    expect(memoryFrontendBootstrap(production, cookie, 'en').initialPreferences).toEqual({
      version: 1,
      mode: 'system',
      palette: 'neutral',
      locale: 'en',
    })
  },
)
