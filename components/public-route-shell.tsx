'use client'

import { Brain } from 'lucide-react'
import { PublicShell, useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { memoryFooter } from '@/lib/frontend-config'
import { FrontendLink } from './frontend-link'
import { FrontendPersistenceNotice } from './frontend-persistence-notice'
import { useMessages } from './i18n/use-messages'

export function PublicRouteShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { preferences } = useFrontendPreferences()
  const t = useMessages()
  return (
    <PublicShell
      brand={{ label: t.brand, homeHref: '/memories', mark: <Brain size={23} /> }}
      footer={memoryFooter(preferences.locale)}
      linkComponent={FrontendLink}
    >
      <FrontendPersistenceNotice />
      {children}
    </PublicShell>
  )
}
