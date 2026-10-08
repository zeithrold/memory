'use client'

import type { FrontendPreferences } from '@/components/ui/ztd-me'
import type { FrontendBootstrap } from '@/lib/frontend-preferences'
import { useCallback, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { FrontendProvider } from '@/components/ui/ztd-me/client'
import { applyMemoryLocale, createMemoryI18n } from '@/lib/i18n/instance'

export function FrontendRoot(
  { children, initialPreferences, policy }: FrontendBootstrap & { children: React.ReactNode },
): React.JSX.Element {
  const [instance] = useState(() => createMemoryI18n(initialPreferences.locale))
  const updateLocale = useCallback((preferences: FrontendPreferences) => {
    applyMemoryLocale(instance, preferences.locale)
  }, [instance])
  return (
    <FrontendProvider initialPreferences={initialPreferences} policy={policy} onPreferencesChange={updateLocale}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </FrontendProvider>
  )
}
