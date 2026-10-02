'use client'
import type { Locale } from '@/lib/i18n/messages'

export function formatDate(locale: Locale, value: string, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  return new Intl.DateTimeFormat(locale, options).format(new Date(value))
}
