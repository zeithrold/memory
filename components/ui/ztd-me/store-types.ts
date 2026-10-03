import type { FrontendPreferences, Locale, Mode, Palette } from './types.js'

export interface PreferenceSnapshot {
  preferences: FrontendPreferences
  resolvedMode: 'light' | 'dark'
  persistence: 'unchanged' | 'saved' | 'unavailable'
}
export interface PreferenceStore {
  getSnapshot: () => PreferenceSnapshot
  getServerSnapshot: () => PreferenceSnapshot
  subscribe: (listener: () => void) => () => void
  connect: () => () => void
  setMode: (mode: Mode) => void
  setPalette: (palette: Palette) => void
  setLocale: (locale: Locale) => void
}
