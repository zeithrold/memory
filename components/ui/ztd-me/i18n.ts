import type { Locale } from './types.js'
import { LOCALES } from './types.js'

export type I18nCatalog = Readonly<Record<string, Readonly<Record<string, string>>>>
export type I18nValues = Readonly<Record<string, string | number>>
export type I18nRequest = {
  locale: Locale
  namespace: string
  key: string
  values: I18nValues
}
/** The host owns engine construction, resource registration and lifecycle. */
export type I18nInstance = {
  translate: (request: I18nRequest) => string
}
export type I18nResources<C extends I18nCatalog> = Readonly<Record<Locale, {
  readonly [N in keyof C]: { readonly [K in keyof C[N]]: string }
}>>
export type I18nAdapter<C extends I18nCatalog> = {
  readonly instance: I18nInstance
  t: <N extends Extract<keyof C, string>>(
    locale: Locale,
    namespace: N,
    key: Extract<keyof C[N], string>,
    values?: I18nValues,
  ) => string
}
export type I18nCoverageIssue = {
  locale: Locale
  namespace: string
  key: string
  reason: 'missing' | 'extra' | 'invalid' | 'interpolation'
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function placeholders(value: string): string {
  return [
    ...value.matchAll(/\{\{([^{}]*)\}\}/gu),
  ]
    .map(match => (match[1] ?? '').split(',')[0]?.trim() ?? '')
    .sort()
    .join(',')
}
function checkNamespace(
  locale: Locale,
  namespace: string,
  expected: Record<string, unknown>,
  actual: unknown,
): I18nCoverageIssue[] {
  if (!isRecord(actual)) {
    return [
      { locale, namespace, key: '', reason: 'missing' },
    ]
  }
  const issues: I18nCoverageIssue[] = []
  for (const key of new Set([
    ...Object.keys(expected),
    ...Object.keys(actual),
  ])) {
    const source = expected[key]
    const translated = actual[key]
    let reason: I18nCoverageIssue['reason'] | null = null
    if (!(key in expected)) {
      reason = 'extra'
    }
    else if (!(key in actual)) {
      reason = 'missing'
    }
    else if (typeof source !== 'string' || typeof translated !== 'string' || translated.trim() === '') {
      reason = 'invalid'
    }
    else if (placeholders(source) !== placeholders(translated)) {
      reason = 'interpolation'
    }
    if (reason !== null) {
      issues.push({ locale, namespace, key, reason })
    }
  }
  return issues
}
/** Check complete English/Chinese namespace and key coverage without mutating an engine. */
export function validateI18nResources(resources: unknown): I18nCoverageIssue[] {
  if (!isRecord(resources) || !isRecord(resources.en)) {
    return [
      { locale: 'en', namespace: '', key: '', reason: 'invalid' },
    ]
  }
  const expected = resources.en
  const issues: I18nCoverageIssue[] = []
  for (const locale of LOCALES) {
    const catalog = resources[locale]
    if (!isRecord(catalog)) {
      issues.push({ locale, namespace: '', key: '', reason: 'missing' })
      continue
    }
    for (const namespace of new Set([
      ...Object.keys(expected),
      ...Object.keys(catalog),
    ])) {
      const source = expected[namespace]
      if (!isRecord(source)) {
        issues.push({ locale, namespace, key: '', reason: namespace in expected ? 'invalid' : 'extra' })
        continue
      }
      issues.push(...checkNamespace(locale, namespace, source, catalog[namespace]))
    }
  }
  return issues
}
/** No hidden engine, mutable global locale, browser storage or second preference store. */
export function createI18nAdapter<const R extends Readonly<Record<Locale, I18nCatalog>>>(options: {
  instance: I18nInstance
  resources: R
}): I18nAdapter<R['en']> {
  const issues = validateI18nResources(options.resources)
  if (issues.length !== 0) {
    throw new Error(`Incomplete i18n resources: ${JSON.stringify(issues)}`)
  }
  return {
    instance: options.instance,
    t: (locale, namespace, key, values = {}) => options.instance.translate({ locale, namespace, key, values }),
  }
}
