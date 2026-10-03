import type {
  FrontendPreferences,
  InitialPreferenceOptions,
  PreferenceCookieResult,
  PreferencePolicy,
} from './types.js'
import { negotiateLocale } from './locale.js'
import { createPreferencePolicy } from './policy.js'
import { normalizePreferences, preferenceRecord, serializePreferences } from './preferences.js'

export const MAX_PREFERENCE_COOKIE_BYTES = 1024

function decodeCookie(value: string): PreferenceCookieResult {
  if (value.length > MAX_PREFERENCE_COOKIE_BYTES) {
    return { status: 'invalid', preferences: null }
  }
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(value))
    const record = preferenceRecord(decoded)
    if (record === null || typeof record.version !== 'number') {
      return { status: 'invalid', preferences: null }
    }
    if (record.version > 1) {
      return { status: 'future', preferences: null }
    }
    if (record.version !== 1) {
      return { status: 'invalid', preferences: null }
    }
    return { status: 'valid', preferences: normalizePreferences(record) }
  }
  catch {
    return { status: 'invalid', preferences: null }
  }
}
export function readPreferenceCookie(header: string, policy: PreferencePolicy): PreferenceCookieResult {
  const { name } = createPreferencePolicy(policy)
  const values = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
  if (values.length === 0) {
    return { status: 'missing', preferences: null }
  }
  if (values.length !== 1) {
    return { status: 'invalid', preferences: null }
  }
  return decodeCookie(values[0]?.slice(name.length + 1) ?? '')
}
export function preferenceCookie(preferences: FrontendPreferences, policy: PreferencePolicy): string {
  const validated = createPreferencePolicy(policy)
  const domain = validated.domain === undefined ? '' : `; Domain=${validated.domain}`
  const secure = validated.secure ? '; Secure' : ''
  const value = serializePreferences(preferences)
  return `${validated.name}=${value}; Path=/; SameSite=Lax; Max-Age=31536000${domain}${secure}`
}
export function resolveInitialPreferences(options: InitialPreferenceOptions): FrontendPreferences {
  const cookie = readPreferenceCookie(options.cookieHeader ?? '', options.policy)
  return cookie.preferences ?? normalizePreferences(null, negotiateLocale(options.acceptLanguage))
}
export function frontendRootAttributes(preferences: FrontendPreferences): {
  'lang': string
  'data-frontend-mode': string
  'data-frontend-palette': string
} {
  const normalized = normalizePreferences(preferences)
  return {
    'lang': normalized.locale,
    'data-frontend-mode': normalized.mode,
    'data-frontend-palette': normalized.palette,
  }
}
