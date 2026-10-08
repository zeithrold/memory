import type { i18n } from 'i18next'
import type { Locale, MessageKey, Messages } from './messages-types'
import { createInstance } from 'i18next'
import { en } from './messages-en'
import { zh } from './messages-zh'

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key)
}

function reportLanguageError(error: unknown): void {
  console.error('Could not apply Memory translations', error)
}

export function createMemoryI18n(locale: Locale): i18n {
  const instance = createInstance()
  instance.init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    resources: { 'en': { translation: en }, 'zh-CN': { translation: zh } },
    keySeparator: false,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  }).catch(reportLanguageError)
  return instance
}

export function applyMemoryLocale(instance: i18n, locale: Locale): void {
  if (instance.language !== locale) {
    instance.changeLanguage(locale).catch(reportLanguageError)
  }
}

export function translatedMessages(instance: i18n, locale: Locale): Messages {
  const translate = instance.getFixedT(locale)
  const result: Messages = { ...en }
  for (const key of Object.keys(result)) {
    if (isMessageKey(key)) {
      result[key] = translate(key)
    }
  }
  return result
}
