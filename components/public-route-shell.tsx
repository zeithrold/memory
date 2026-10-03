'use client'

import { PublicShell } from '@ztd-me/frontend/client'
import { Brain } from 'lucide-react'
import { FrontendLink } from './frontend-link'
import { FrontendPersistenceNotice } from './frontend-persistence-notice'

export function PublicRouteShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PublicShell
      brand={{ label: 'Shared Memory', homeHref: '/memories', mark: <Brain size={23} /> }}
      repositoryUrl="https://github.com/zeithrold/memory"
      linkComponent={FrontendLink}
    >
      <FrontendPersistenceNotice />
      {children}
    </PublicShell>
  )
}
