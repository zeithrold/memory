'use client'

import { useFrontendPreferences } from '@ztd-me/frontend/client'
import { messages } from '@/lib/i18n/messages'

export function FrontendPersistenceNotice(): React.JSX.Element | null {
  const { persistence, preferences } = useFrontendPreferences()
  if (persistence !== 'unavailable') {
    return null
  }
  return <p className="setup-banner" role="status">{messages(preferences.locale).preferencePersistenceError}</p>
}
