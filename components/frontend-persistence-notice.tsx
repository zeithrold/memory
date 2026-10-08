'use client'

import { useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { useMessages } from './i18n/use-messages'

const SETUP_BANNER_CLASS = [
  'setup-banner bg-muted border border-border rounded-md py-4 px-5 mb-6 text-foreground text-body',
  '[&_p]:my-2 [&_p]:mx-0 [&_small]:text-body',
].join(' ')

export function FrontendPersistenceNotice(): React.JSX.Element | null {
  const { persistence } = useFrontendPreferences()
  const t = useMessages()
  if (persistence !== 'unavailable') {
    return null
  }
  return (
    <p
      className={SETUP_BANNER_CLASS}
      role="status"
    >
      {t.preferencePersistenceError}
    </p>
  )
}
