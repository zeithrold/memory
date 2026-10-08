'use client'

import { Brain, LockKeyhole } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { ApplicationShell, useFrontendPreferences } from '@/components/ui/ztd-me/client'
import { memoryFooter } from '@/lib/frontend-config'
import { FrontendLink } from './frontend-link'
import { FrontendPersistenceNotice } from './frontend-persistence-notice'
import { useMessages } from './i18n/use-messages'
import { BrowserObservability } from './observability'
import { Toaster } from './ui/sonner'
import { WorkspaceAccountControl } from './workspace-account-control'
import { useWorkspace } from './workspace-context'
import { WorkspaceNavigation } from './workspace-navigation'
import { WorkspaceProvider } from './workspace-provider'

const EYEBROW_CLASS = ['eyebrow text-help tracking-[2px] uppercase text-primary font-[650]'].join(' ')

const WORKSPACE_SECURITY_NOTE_CLASS = [
  'workspace-security-note flex items-center gap-2 max-w-320 mx-auto py-2 px-8 text-muted-foreground',
  'text-control max-[640px]:px-4 flex-wrap',
].join(' ')

const PAGE_HEADING_CLASS = [
  'page-heading flex items-center justify-between gap-6 mb-8 max-[1000px]:items-start',
  'max-[1000px]:flex-col max-[1000px]:gap-2 flex-wrap wrap-anywhere',
].join(' ')

const SETUP_BANNER_CLASS = [
  'setup-banner bg-muted border border-border rounded-md py-4 px-5 mb-6 text-foreground text-body',
  '[&_p]:my-2 [&_p]:mx-0 [&_small]:text-body',
].join(' ')

export type { Api } from './api-client'
type WorkspaceShellProps = {
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
  const t = useMessages()
  const configured = accessTeamDomain.length > 0
  return (
    <WorkspaceProvider t={t} locale={preferences.locale} authState={configured ? 'ready' : 'unconfigured'}>
      <BrowserObservability dsn={sentryDsn} release={sentryRelease} />
      <Toaster theme={resolvedMode} containerAriaLabel={t.notifications} />
      <ApplicationShell
        brand={{ label: t.brand, homeHref: '/memories', mark: <Brain size={23} /> }}
        brandClassName="max-sm:text-control max-sm:[&_>_svg]:hidden max-sm:[&_>_span]:wrap-normal"
        footer={memoryFooter(preferences.locale)}
        mainId="workspace-content"
        linkComponent={FrontendLink}
        identity={<WorkspaceAccountControl accessTeamDomain={accessTeamDomain} t={t} />}
        businessNavigation={<WorkspaceNavigation t={t} pathname={pathname} />}
        serviceNotice={(
          <div className={WORKSPACE_SECURITY_NOTE_CLASS}>
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

type PageHeadingProps = { section: string, title: string, intro: string, action?: React.ReactNode }

export function PageHeading(
  { section, title, intro, action }: PageHeadingProps,
): React.JSX.Element {
  return (
    <div className={PAGE_HEADING_CLASS}>
      <div>
        <span className={EYEBROW_CLASS}>{section}</span>
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
    <div
      className={SETUP_BANNER_CLASS}
      role="status"
    >
      <strong>{t.setup}</strong>
      <p>{t.setupBody}</p>
      <small>{t.setupHelp}</small>
    </div>
  )
}
