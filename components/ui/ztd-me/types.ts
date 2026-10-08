export const MODES = [
  'system',
  'light',
  'dark',
] as const
export const LOCALES = ['en', 'zh-CN'] as const
export const PALETTES = [
  'neutral',
  'terracotta',
  'moss',
  'ocean',
  'plum',
  'graphite',
] as const

export type Mode = (typeof MODES)[number]
export type Locale = (typeof LOCALES)[number]
export type Palette = (typeof PALETTES)[number]
export type FrontendPreferences = {
  version: 1
  mode: Mode
  palette: Palette
  locale: Locale
}
export type PreferencePolicyOptions = {
  name?: string
  domain?: string
  secure?: boolean
  mirrorKey?: string
}
export type PreferencePolicy = {
  readonly name: string
  readonly domain?: string
  readonly secure: boolean
  readonly mirrorKey?: string
}
export type PreferenceCookieResult = {
  status: 'valid' | 'missing' | 'invalid' | 'future'
  preferences: FrontendPreferences | null
}
export type InitialPreferenceOptions = {
  policy: PreferencePolicy
  cookieHeader?: string | undefined
  acceptLanguage?: string | undefined
}
