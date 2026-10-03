import type { FrontendPreferences, Locale, Mode, Palette } from './types.js'
import { LOCALES, MODES, PALETTES } from './types.js'

export const DEFAULT_PREFERENCES: Readonly<FrontendPreferences> = Object.freeze({
  version: 1,
  mode: 'system',
  palette: 'neutral',
  locale: 'en',
})

export function isMode(value: unknown): value is Mode {
  return new Set<unknown>(MODES).has(value)
}
export function isPalette(value: unknown): value is Palette {
  return new Set<unknown>(PALETTES).has(value)
}
export function isLocale(value: unknown): value is Locale {
  return new Set<unknown>(LOCALES).has(value)
}
export function isPreferenceRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
export function preferenceRecord(value: unknown): Record<string, unknown> | null {
  return isPreferenceRecord(value) ? value : null
}
export function normalizePreferences(value: unknown, fallbackLocale: Locale = 'en'): FrontendPreferences {
  const record = preferenceRecord(value)
  if (record?.version !== 1) {
    return { ...DEFAULT_PREFERENCES, locale: fallbackLocale }
  }
  return {
    version: 1,
    mode: isMode(record.mode) ? record.mode : 'system',
    palette: isPalette(record.palette) ? record.palette : 'neutral',
    locale: isLocale(record.locale) ? record.locale : fallbackLocale,
  }
}
export function serializePreferences(value: FrontendPreferences): string {
  return encodeURIComponent(JSON.stringify(normalizePreferences(value)))
}
