'use client'

import { Brain, LockKeyhole } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { ApplicationShell, useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { memoryFooter } from '@/lib/frontend-config'
import { messages } from '@/lib/i18n/messages'
import { FrontendLink } from './frontend-link'
import { FrontendPersistenceNotice } from './frontend-persistence-notice'
import { BrowserObservability } from './observability'
import { Toaster } from './ui/sonner'
import { WorkspaceAccountControl } from './workspace-account-control'
import { useWorkspace } from './workspace-context'
import { WorkspaceNavigation } from './workspace-navigation'
import { WorkspaceProvider } from './workspace-provider'

export type { Api } from './api-client'
interface WorkspaceShellProps {
  children: React.ReactNode
  accessTeamDomain: string
  sentryDsn?: string
  sentryRelease?: string
}

export default function WorkspaceShell(
  { children, accessTeamDomain, sentryDsn = '', sentryRelease = '' }: WorkspaceShellProps,
): React.JSX.Element {
  const { preferences, resolvedMode } = useFrontendPreferences()
  const pathname = usePathname()
  const t = messages(preferences.locale)
  const configured = accessTeamDomain.length > 0
  return (
    <WorkspaceProvider t={t} locale={preferences.locale} authState={configured ? 'ready' : 'unconfigured'}>
      <BrowserObservability dsn={sentryDsn} release={sentryRelease} />
      <Toaster theme={resolvedMode} containerAriaLabel={t.notifications} />
      <ApplicationShell
        brand={{ label: t.brand, homeHref: '/memories', mark: <Brain size={23} /> }}
        footer={memoryFooter(preferences.locale)}
        mainId="workspace-content"
        linkComponent={FrontendLink}
        identity={<WorkspaceAccountControl accessTeamDomain={accessTeamDomain} t={t} />}
        businessNavigation={<WorkspaceNavigation t={t} pathname={pathname} />}
        serviceNotice={(
          <div className="workspace-security-note">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>{t.secureNote}</span>
          </div>
        )}
      >
        <FrontendPersistenceNotice />
        {children}
      </ApplicationShell>
    </WorkspaceProvider>
  )
}

interface PageHeadingProps { section: string, title: string, intro: string, action?: React.ReactNode }

export function PageHeading(
  { section, title, intro, action }: PageHeadingProps,
): React.JSX.Element {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{section}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      {action}
    </div>
  )
}

export function SetupBanner(): React.JSX.Element {
  const { t } = useWorkspace()
  return (
    <div className="setup-banner" role="status">
      <strong>{t.setup}</strong>
      <p>{t.setupBody}</p>
      <small>{t.setupHelp}</small>
    </div>
  )
}
