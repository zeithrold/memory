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
export interface FrontendPreferences {
  version: 1
  mode: Mode
  palette: Palette
  locale: Locale
}
export interface PreferencePolicyOptions {
  name?: string
  domain?: string
  secure?: boolean
  mirrorKey?: string
}
export interface PreferencePolicy {
  readonly name: string
  readonly domain?: string
  readonly secure: boolean
  readonly mirrorKey?: string
}
export interface PreferenceCookieResult {
  status: 'valid' | 'missing' | 'invalid' | 'future'
  preferences: FrontendPreferences | null
}
export interface InitialPreferenceOptions {
  policy: PreferencePolicy
  cookieHeader?: string | undefined
  acceptLanguage?: string | undefined
}
