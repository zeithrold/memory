'use client'

/* eslint-disable react-refresh/only-export-components, react/no-context-provider, react/no-use-context */

import type { Locale, Messages } from '@/lib/i18n/messages'
import { enUS, zhCN } from '@clerk/localizations'
import { ClerkProvider, SignInButton, useAuth, UserButton } from '@clerk/react'
import { BookOpen, Brain, Cable, ChartNoAxesCombined, FolderTree, KeyRound, Languages, LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { z } from 'zod'
import { messages } from '@/lib/i18n/messages'
import { BrowserObservability } from './observability'
import { PageSkeleton } from './skeletons'
import { Button } from './ui/button'
import { Toaster } from './ui/sonner'

export type Api = <T>(path: string, init?: RequestInit) => Promise<T>
interface WorkspaceValue {
  t: Messages
  locale: Locale
  authState: 'ready' | 'unconfigured'
  api: Api
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null)
const problemSchema = z.object({ code: z.string(), detail: z.string().optional(), title: z.string().optional() })

export class ProblemError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ProblemError'
  }
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value)
    throw new Error('Workspace components must be rendered inside WorkspaceShell.')
  return value
}

function Content({ children, t, locale, authState, getToken }: {
  children: React.ReactNode
  t: Messages
  locale: Locale
  authState: WorkspaceValue['authState']
  getToken?: () => Promise<string | null>
}) {
  const api = useCallback<Api>(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const token = await getToken?.()
    if (token === null || token === undefined || token.length === 0)
      throw new Error(t.signIn)
    const response = await fetch(`/api/v1/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...init?.headers },
    })
    if (!response.ok) {
      const parsed = problemSchema.safeParse(await response.json())
      if (parsed.success)
        throw new ProblemError(parsed.data.detail ?? parsed.data.title ?? t.loadError, parsed.data.code)
      throw new Error(t.loadError)
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  }, [getToken, t])
  const value = useMemo(() => ({ t, locale, authState, api }), [api, authState, locale, t])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function Authenticated({ children, t, locale }: { children: React.ReactNode, t: Messages, locale: Locale }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  if (!isLoaded)
    return <main className="page"><PageSkeleton /></main>
  if (!isSignedIn) {
    return (
      <main className="page">
        <div className="welcome">
          <span className="eyebrow">SHARED MEMORY</span>
          <h1>{t.heading}</h1>
          <p>{t.signInBody}</p>
          <SignInButton mode="modal"><Button>{t.signIn}</Button></SignInButton>
        </div>
      </main>
    )
  }
  return <Content t={t} locale={locale} authState="ready" getToken={getToken}>{children}</Content>
}

export default function WorkspaceShell({ children, initialLocale, publishableKey, sentryDsn = '', sentryRelease = '' }: {
  children: React.ReactNode
  initialLocale: Locale
  publishableKey: string
  sentryDsn?: string
  sentryRelease?: string
}) {
  const [locale, setLocale] = useState(initialLocale)
  const pathname = usePathname()
  const t = messages(locale)
  const nav = [
    { id: 'memories', href: '/memories', icon: BookOpen },
    { id: 'catalog', href: '/catalog', icon: FolderTree },
    { id: 'tokens', href: '/tokens', icon: KeyRound },
    { id: 'usage', href: '/usage', icon: ChartNoAxesCombined },
    { id: 'connect', href: '/connect', icon: Cable },
  ] as const
  const shell = (content: React.ReactNode, account?: React.ReactNode) => (
    <div className="app-shell">
      <BrowserObservability dsn={sentryDsn} release={sentryRelease} />
      <Toaster containerAriaLabel={t.notifications} />
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
            const active = pathname === href || (id === 'memories' && pathname.startsWith('/memories/'))
            return (
              <Link key={id} href={href} prefetch={false} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
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
      <div className="main-shell">
        <header className="topbar">
          <span>{t.workspace}</span>
          <div className="topbar-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = locale === 'en' ? 'zh-CN' : 'en'
                setLocale(next)
                document.documentElement.lang = next
                document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
              }}
              aria-label={t.language}
            >
              <Languages size={16} />
              {locale === 'en' ? '中文' : 'English'}
            </Button>
            {account}
          </div>
        </header>
        {content}
      </div>
    </div>
  )
  if (!publishableKey)
    return shell(<Content t={t} locale={locale} authState="unconfigured">{children}</Content>)
  return (
    <ClerkProvider publishableKey={publishableKey} localization={locale === 'zh-CN' ? zhCN : enUS}>
      {shell(<Authenticated t={t} locale={locale}>{children}</Authenticated>, <UserButton />)}
    </ClerkProvider>
  )
}

export function PageHeading({ section, title, intro, action }: { section: string, title: string, intro: string, action?: React.ReactNode }) {
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

export function SetupBanner() {
  const { t } = useWorkspace()
  return (
    <div className="setup-banner" role="status">
      <strong>{t.setup}</strong>
      <p>{t.setupBody}</p>
      <small>{t.setupHelp}</small>
    </div>
  )
}
