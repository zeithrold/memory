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
  'workspace-security-note flex items-center gap-2 w-full max-w-292 mx-auto pt-3 px-12 pb-0',
  'text-muted-foreground text-help max-[1000px]:px-6 max-[640px]:px-4 flex-wrap',
].join(' ')

const PAGE_HEADING_CLASS = [
  'page-heading flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-7 pb-6 border-b',
  'border-border wrap-anywhere max-[640px]:items-start',
].join(' ')

const SETUP_BANNER_CLASS = [
  'setup-banner grid grid-cols-[18px_minmax(0,1fr)] items-start gap-3 bg-muted/50 border',
  'border-border rounded-sm p-4 mb-6 text-foreground text-control [&_p]:my-2',
  '[&_p]:text-muted-foreground [&_p]:leading-[1.8] [&_small]:text-help',
  '[&_small]:text-muted-foreground',
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
        mainClassName="mx-auto w-full max-w-292"
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
      <LockKeyhole size={17} className="mt-0.5 text-muted-foreground" aria-hidden="true" />
      <div>
        <strong className="font-semibold">{t.setup}</strong>
        <p>{t.setupBody}</p>
        <small>{t.setupHelp}</small>
      </div>
    </div>
  )
}
