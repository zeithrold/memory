import { hasControlCharacters } from './text.js'

function validateHref(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()
    || value.startsWith('//') || value.includes('\\') || hasControlCharacters(value)) {
    throw new TypeError('Link href must be a nonempty URL or relative path without control characters or backslashes')
  }
}

export function safeHref(value: string, allowMailto = false): string {
  validateHref(value)
  const url = new URL(value, 'https://frontend.invalid')
  if (url.protocol !== 'https:' && url.protocol !== 'http:' && !(allowMailto && url.protocol === 'mailto:')) {
    throw new TypeError('Link href supports HTTP, HTTPS, relative paths and optional mailto URLs')
  }
  return value
}
