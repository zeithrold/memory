import type { PreferenceProbe } from '../tests/e2e/preference-storage-fixture'

// Native Window extension requires declaration merging; business objects use aliases.
declare global {
  interface Window {
    memoryMenuAnimations: { name: string, pointerEvents: string }[]
    memoryFontCspViolations: string[]
    memoryPreferenceProbe: PreferenceProbe
    memoryPreferenceCookieWrites: string[]
  }
}
