'use client'

import type { I18nAdapter, I18nCatalog, I18nValues } from './i18n.js'
import type { Locale } from './types.js'
import { useFrontendPreferences } from './context.js'

export type I18nBinding<C extends I18nCatalog> = {
  locale: Locale
  t: <N extends Extract<keyof C, string>>(
    namespace: N,
    key: Extract<keyof C[N], string>,
    values?: I18nValues,
  ) => string
}
/** Inject the host adapter; FrontendProvider is the single browser locale authority. */
export function useI18n<C extends I18nCatalog>(adapter: I18nAdapter<C>): I18nBinding<C> {
  const { preferences } = useFrontendPreferences()
  return {
    locale: preferences.locale,
    t: (namespace, key, values) => adapter.t(preferences.locale, namespace, key, values),
  }
}
