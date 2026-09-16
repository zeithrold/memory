'use client'

import type { Locale, Messages } from '@/lib/i18n/messages'
import { enUS, zhCN } from '@clerk/localizations'
import { ClerkProvider, SignInButton, useAuth, UserButton } from '@clerk/react'
import {
  BookOpen,
  Brain,
  Cable,
  ChartNoAxesCombined,
  KeyRound,
  Languages,
  LockKeyhole,
} from 'lucide-react'
import { useState } from 'react'
import { messages } from '@/lib/i18n/messages'
import { Dashboard } from './dashboard'
import { BrowserObservability } from './observability'
import { Button } from './ui/button'

export type Tab = 'memories' | 'tokens' | 'usage' | 'connect'
export default function App({
  initialLocale,
  publishableKey,
  sentryDsn = '',
  sentryRelease = '',
}: {
  initialLocale: Locale
  publishableKey: string
  sentryDsn?: string
  sentryRelease?: string
}) {
  const [locale, setLocale] = useState(initialLocale)
  const [tab, setTab] = useState<Tab>('memories')
  const t = messages(locale)
  function changeLocale() {
    const next = locale === 'en' ? 'zh-CN' : 'en'
    setLocale(next)
    document.documentElement.lang = next
    document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const content = (account?: React.ReactNode) => (
    <div className="app-shell">
      <BrowserObservability dsn={sentryDsn} release={sentryRelease} />
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Brain size={23} />
          </span>
          <span>
            {t.brand}
            <small>{t.tagline}</small>
          </span>
        </a>
        <p className="nav-caption">{t.overview}</p>
        <nav aria-label={t.workspace}>
          {(
            [
              { id: 'memories', icon: BookOpen },
              { id: 'tokens', icon: KeyRound },
              { id: 'usage', icon: ChartNoAxesCombined },
              { id: 'connect', icon: Cable },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={18} />
              {t[id]}
            </button>
          ))}
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
              onClick={changeLocale}
              aria-label={t.language}
            >
              <Languages size={16} />
              {locale === 'en' ? '中文' : 'English'}
            </Button>
            {account}
          </div>
        </header>
        {publishableKey
          ? (
              <Authenticated t={t} locale={locale} tab={tab} />
            )
          : (
              <Dashboard t={t} locale={locale} tab={tab} authState="unconfigured" />
            )}
      </div>
    </div>
  )
  if (!publishableKey)
    return content()
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      localization={locale === 'zh-CN' ? zhCN : enUS}
    >
      {content(<UserButton />)}
    </ClerkProvider>
  )
}
function Authenticated({
  t,
  locale,
  tab,
}: {
  t: Messages
  locale: Locale
  tab: Tab
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  if (!isLoaded) {
    return (
      <main className="page">
        <p role="status">{t.working}</p>
      </main>
    )
  }
  if (!isSignedIn) {
    return (
      <main className="page">
        <div className="welcome">
          <span className="eyebrow">SHARED MEMORY</span>
          <h1>{t.heading}</h1>
          <p>{t.signInBody}</p>
          <SignInButton mode="modal">
            <Button>{t.signIn}</Button>
          </SignInButton>
        </div>
      </main>
    )
  }
  return (
    <Dashboard
      t={t}
      locale={locale}
      tab={tab}
      authState="ready"
      getToken={getToken}
    />
  )
}
