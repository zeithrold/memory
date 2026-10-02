'use client'

import type { Locale, Messages } from '@/lib/i18n/messages'
import {
  Brain,
  Languages,
  LockKeyhole,
} from 'lucide-react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { messages } from '@/lib/i18n/messages'
import { BrowserObservability } from './observability'
import { Button } from './ui/button'
import { Toaster } from './ui/sonner'
import { WorkspaceAccountControl } from './workspace-account-control'
import { useWorkspace } from './workspace-context'
import { WorkspaceNavigation } from './workspace-navigation'
import { WorkspaceProvider } from './workspace-provider'

export type { Api } from './api-client'
interface WorkspaceShellProps {
  children: React.ReactNode
  initialLocale: Locale
  accessTeamDomain: string
  sentryDsn?: string
  sentryRelease?: string
}

export default function WorkspaceShell(
  { children, initialLocale, accessTeamDomain, sentryDsn = '', sentryRelease = '' }: WorkspaceShellProps,
): React.JSX.Element {
  const [locale, setLocale] = useState(initialLocale)
  const pathname = usePathname()
  const t = messages(locale)
  const configured = accessTeamDomain.length > 0
  return (
    <ShellFrame
      t={t}
      locale={locale}
      setLocale={setLocale}
      pathname={pathname}
      sentryDsn={sentryDsn}
      sentryRelease={sentryRelease}
      accountControl={<WorkspaceAccountControl accessTeamDomain={accessTeamDomain} t={t} />}
    >
      <WorkspaceProvider t={t} locale={locale} authState={configured ? 'ready' : 'unconfigured'}>
        {children}
      </WorkspaceProvider>
    </ShellFrame>
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

interface ShellFrameProps {
  t: Messages
  locale: Locale
  setLocale: React.Dispatch<React.SetStateAction<Locale>>
  pathname: string
  sentryDsn: string
  sentryRelease: string
  accountControl: React.ReactNode
  children: React.ReactNode
}

interface WorkspaceSidebarProps {
  t: Messages
  pathname: string
}

function WorkspaceSidebar({ t, pathname }: WorkspaceSidebarProps): React.JSX.Element {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/memories" prefetch={false}>
        <span className="brand-mark"><Brain size={23} /></span>
        <span>
          {t.brand}
          <small>{t.tagline}</small>
        </span>
      </Link>
      <p className="nav-caption">{t.overview}</p>
      <WorkspaceNavigation t={t} pathname={pathname} />
      <div className="sidebar-bottom">
        <LockKeyhole size={16} />
        <p>{t.secureNote}</p>
        <small>{t.footer}</small>
      </div>
    </aside>
  )
}
function ShellFrame(
  props: ShellFrameProps,
): React.JSX.Element {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">{props.t.skipToContent}</a>
      <BrowserObservability dsn={props.sentryDsn} release={props.sentryRelease} />
      <Toaster containerAriaLabel={props.t.notifications} />
      <WorkspaceSidebar t={props.t} pathname={props.pathname} />
      <div className="main-shell">
        <header className="topbar">
          <span>{props.t.workspace}</span>
          <div className="topbar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = props.locale === 'en' ? 'zh-CN' : 'en'
                props.setLocale(next)
                document.documentElement.lang = next
                document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
              }}
              aria-label={props.t.language}
            >
              <Languages size={16} />
              {props.locale === 'en' ? '中文' : 'English'}
            </Button>
            {props.accountControl}
          </div>
        </header>
        <div id="workspace-content" tabIndex={-1}>{props.children}</div>
      </div>
    </div>
  )
}
