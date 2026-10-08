import type { PreferencePolicy, PreferencePolicyOptions } from './types.js'
import { isPreferenceRecord } from './preferences.js'
import { hasControlCharacters } from './text.js'

const optionKeys = new Set([
  'name',
  'domain',
  'secure',
  'mirrorKey',
])

function cookieDomain(value: unknown): string {
  if (typeof value !== 'string' || value.length > 253) {
    throw new TypeError('Cookie domain must be a DNS name of at most 253 characters')
  }
  const domain = value.toLowerCase()
  const labels = domain.split('.')
  const labelPattern = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u
  if (labels.length < 2 || labels.some(label => !labelPattern.test(label)) || /^\d+$/u.test(labels.at(-1) ?? '')) {
    throw new TypeError('Cookie domain must be a DNS name without a scheme, port, leading dot or IP address')
  }
  return domain
}

function cookieName(value: unknown): string {
  const name = value === undefined ? 'frontend.preferences.v1' : value
  if (typeof name !== 'string' || name.length === 0 || name.length > 128 || !/^[\w!#$%&'*+.^|~-]+$/u.test(name)) {
    throw new TypeError('Cookie name must be a nonempty token of at most 128 characters')
  }
  return name
}

function cookieSecure(value: unknown): boolean {
  const secure = value === undefined ? true : value
  if (typeof secure !== 'boolean') {
    throw new TypeError('Cookie secure must be a boolean')
  }
  return secure
}

function validateScope(name: string, secure: boolean, domain: string | undefined): void {
  if (domain !== undefined && !secure) {
    throw new TypeError('Domain cookies require Secure')
  }
  if ((name.startsWith('__Secure-') || name.startsWith('__Host-')) && !secure) {
    throw new TypeError('Prefixed cookies require Secure')
  }
  if (name.startsWith('__Host-') && domain !== undefined) {
    throw new TypeError('__Host- cookies must be host-only')
  }
}

function notificationKey(mirrorKey: unknown): string | undefined {
  if (mirrorKey !== undefined && (typeof mirrorKey !== 'string' || mirrorKey.length === 0
    || mirrorKey.length > 128 || hasControlCharacters(mirrorKey))) {
    throw new TypeError('Mirror key must be nonempty, at most 128 characters and free of control characters')
  }
  return mirrorKey
}

function validateOptions(options: unknown): void {
  if (!isPreferenceRecord(options) || Object.keys(options).some(key => !optionKeys.has(key))) {
    throw new TypeError('Preference policy accepts only name, domain, secure and mirrorKey')
  }
}

export function createPreferencePolicy(options: PreferencePolicyOptions = {}): PreferencePolicy {
  validateOptions(options)
  const name = cookieName(options.name)
  const secure = cookieSecure(options.secure)
  const domain = options.domain === undefined ? undefined : cookieDomain(options.domain)
  validateScope(name, secure, domain)
  const mirrorKey = notificationKey(options.mirrorKey)
  return Object.freeze({
    name,
    secure,
    ...(domain === undefined ? {} : { domain }),
    ...(mirrorKey === undefined ? {} : { mirrorKey }),
  })
}
