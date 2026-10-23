'use client'

import { Brain } from 'lucide-react'
import { PublicShell, useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { memoryFooter } from '@/lib/frontend-config'
import { FrontendLink } from './frontend-link'
import { FrontendPersistenceNotice } from './frontend-persistence-notice'
import { useMessages } from './i18n/use-messages'
import { MEMORY_BRAND_CLASS, MEMORY_CHROME_CLASS } from './memory-chrome'

export function PublicRouteShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { preferences } = useFrontendPreferences()
  const t = useMessages()
  return (
    <PublicShell
      brand={{ label: t.brand, homeHref: '/memories', mark: <Brain size={23} /> }}
      brandClassName={MEMORY_BRAND_CLASS}
      chromeClassName={MEMORY_CHROME_CLASS}
      footer={memoryFooter(preferences.locale)}
      linkComponent={FrontendLink}
    >
      <FrontendPersistenceNotice />
      {children}
    </PublicShell>
  )
}
