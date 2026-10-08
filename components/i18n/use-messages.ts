'use client'

import type { i18n } from 'i18next'
import type { Messages } from '@/lib/i18n/messages'
import { use, useMemo } from 'react'
import { I18nContext } from 'react-i18next'
import { useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { translatedMessages } from '@/lib/i18n/instance'

function requireInstance(context: { i18n: i18n } | undefined): i18n {
  if (context === undefined) {
    throw new Error('useMessages requires the root I18nextProvider')
  }
  return context.i18n
}

export function useMessages(): Messages {
  const instance = requireInstance(use(I18nContext))
  const { preferences: { locale } } = useFrontendPreferences()
  return useMemo(() => translatedMessages(instance, locale), [instance, locale])
}
