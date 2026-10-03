import type { FrontendPreferences, PreferenceCookieResult, PreferencePolicy } from './types.js'
import { preferenceCookie, readPreferenceCookie } from './cookies.js'
import { serializePreferences } from './preferences.js'

function browserCookieHeader(): string | null {
  try {
    return document.cookie
  }
  catch {
    return null
  }
}
export function readBrowserPreferences(policy: PreferencePolicy):
  PreferenceCookieResult | { status: 'unavailable', preferences: null } {
  const header = browserCookieHeader()
  return header === null
    ? { status: 'unavailable', preferences: null }
    : readPreferenceCookie(header, policy)
}
export function persistBrowserPreferences(preferences: FrontendPreferences, policy: PreferencePolicy): boolean {
  try {
    document.cookie = preferenceCookie(preferences, policy)
    const read = readBrowserPreferences(policy)
    if (read.preferences === null || serializePreferences(read.preferences) !== serializePreferences(preferences)) {
      return false
    }
    try {
      if (policy.mirrorKey !== undefined) {
        localStorage.setItem(policy.mirrorKey, serializePreferences(preferences))
      }
    }
    catch {
      // Cookie persistence still works when the optional same-origin notification mirror is unavailable.
    }
    return true
  }
  catch {
    return false
  }
}
