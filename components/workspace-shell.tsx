'use client'

import type { WorkspaceValue } from './workspace-context'
import type { Locale, Messages } from '@/lib/i18n/messages'
import {
  BookOpen,
  Brain,
  Cable,
  ChartNoAxesCombined,
  FolderTree,
  KeyRound,
  Languages,
  LockKeyhole,
  LogOut,
} from 'lucide-react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { messages } from '@/lib/i18n/messages'
import { createApi } from './api-client'
import { BrowserObservability } from './observability'
import { Button } from './ui/button'
import { Toaster } from './ui/sonner'
import { useWorkspace, WorkspaceContext } from './workspace-context'

export type { Api } from './api-client'
interface ContentProps {
  children: React.ReactNode
  t: Messages
  locale: Locale
  authState: WorkspaceValue['authState']
}

function Content({ children, t, locale, authState }: ContentProps) {
  const api = useMemo(() => createApi(authState, t), [authState, t])
  const value = useMemo(() => ({ t, locale, authState, api }), [
    api,
    authState,
    locale,
    t,
  ])
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

function accessLogoutUrl(
  teamDomain: string,
): string {
  const returnTo = typeof window === 'undefined' ? '/' : window.location.origin
  return `${teamDomain.replace(/\/+$/, '')}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(returnTo)}`
}

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
  const nav = [
    { id: 'memories', href: '/memories', icon: BookOpen },
    { id: 'catalog', href: '/catalog', icon: FolderTree },
    { id: 'tokens', href: '/tokens', icon: KeyRound },
    { id: 'usage', href: '/usage', icon: ChartNoAxesCombined },
    { id: 'connect', href: '/connect', icon: Cable },
  ] as const
  const account = configured
    ? (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            window.location.href = accessLogoutUrl(accessTeamDomain)
          }}
        >
          <LogOut size={16} />
          {t.signOut}
        </Button>
      )
    : null
  return (
    <ShellFrame
      t={t}
      locale={locale}
      setLocale={setLocale}
      pathname={pathname}
      nav={nav}
      sentryDsn={sentryDsn}
      sentryRelease={sentryRelease}
      accountControl={account}
    >
      <Content t={t} locale={locale} authState={configured ? 'ready' : 'unconfigured'}>{children}</Content>
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
  nav: readonly { id: 'memories' | 'catalog' | 'tokens' | 'usage' | 'connect', href: string, icon: typeof BookOpen }[]
  sentryDsn: string
  sentryRelease: string
  accountControl: React.ReactNode
  children: React.ReactNode
}

interface WorkspaceSidebarProps {
  t: Messages
  nav: readonly {
    id: 'memories' | 'catalog' | 'tokens' | 'usage' | 'connect'
    href: string
    icon: typeof BookOpen
  }[]
  pathname: string
}

function WorkspaceSidebar({ t, nav, pathname }: WorkspaceSidebarProps): React.JSX.Element {
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
      <nav aria-label={t.workspace}>
        {nav.map(({ id, href, icon: Icon }) => {
          const active = pathname === href
            || (id === 'memories' && pathname.startsWith('/memories/'))
            || (id === 'catalog' && pathname.startsWith('/catalog/'))
          return (
            <Link
              key={id}
              href={href}
              prefetch={false}
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              {t[id]}
            </Link>
          )
        })}
      </nav>
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
      <BrowserObservability dsn={props.sentryDsn} release={props.sentryRelease} />
      <Toaster containerAriaLabel={props.t.notifications} />
      <WorkspaceSidebar t={props.t} nav={props.nav} pathname={props.pathname} />
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
        {props.children}
      </div>
    </div>
  )
}
