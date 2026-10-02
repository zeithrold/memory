'use client'
import type { CatalogSettings, CatalogView } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './ui/alert'

export function CatalogStats({ t, catalog }: CatalogStatsProps): React.JSX.Element {
  return (
    <div className="stats">
      <div>
        <span>{t.categories}</span>
        <strong>{catalog?.categories.length ?? 0}</strong>
      </div>
      <div>
        <span>{t.assigned}</span>
        <strong>{catalog?.assigned ?? 0}</strong>
      </div>
      <div>
        <span>{t.unclassified}</span>
        <strong>{catalog?.orphans ?? 0}</strong>
      </div>
    </div>
  )
}

function CatalogBudgetNotice(
  { settings, t }: CatalogBudgetNoticeProps,
): React.JSX.Element {
  return (
    <Alert variant={settings.budgetExceeded ? 'destructive' : 'default'}>
      <ShieldAlert />
      <AlertTitle>{t.dailyTokenBudget}</AlertTitle>
      <AlertDescription>
        {`${settings.todayTokens.toLocaleString()} / ${settings.dailyTokenBudget.toLocaleString()} ${t.modelTokens}`}
        {!settings.tokenUsageComplete && ` · ${t.usageIncomplete}`}
      </AlertDescription>
    </Alert>
  )
}

interface PendingAdviceNoticeProps {
  t: Messages
  catalog: CatalogView
}

function PendingAdviceNotice({ t, catalog }: PendingAdviceNoticeProps): React.JSX.Element {
  return (
    <Alert>
      <ShieldAlert />
      <AlertTitle>{t.pendingAdviceHint}</AlertTitle>
      <AlertDescription>{catalog.pendingAdvice}</AlertDescription>
    </Alert>
  )
}
export function CatalogNotices(
  { error, t, settings, catalog }: CatalogNoticesProps,
): React.JSX.Element {
  return (
    <>
      {error.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>{t.loadError}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {settings?.awaitingReview === true && (
        <Alert>
          <ShieldAlert />
          <AlertTitle>{t.awaitingReview}</AlertTitle>
          <AlertDescription>{t.awaitingReviewDescription}</AlertDescription>
        </Alert>
      )}
      {settings?.failureStreak !== undefined && settings.failureStreak > 0
        && (
          <Alert>
            <ShieldAlert />
            <AlertTitle>{t.failureBackoff}</AlertTitle>
            <AlertDescription>{`${t.failureBackoffDescription} ${settings.failureStreak}`}</AlertDescription>
          </Alert>
        )}
      {settings !== null && (
        <CatalogBudgetNotice settings={settings} t={t} />
      )}
      <CatalogAdvice catalog={catalog} t={t} />

    </>
  )
}

interface CatalogStatsProps {
  t: Messages
  catalog: CatalogView | null
}

interface CatalogBudgetNoticeProps {
  settings: CatalogSettings
  t: Messages
}

interface CatalogNoticesProps {
  error: string
  t: Messages
  settings: CatalogSettings | null
  catalog: CatalogView | null
}

function CatalogAdvice(
  { catalog, t }: Pick<CatalogNoticesProps, 'catalog' | 't'>,
): React.JSX.Element | null {
  if (catalog === null || catalog.pendingAdvice === null || catalog.pendingAdvice.length === 0) {
    return null
  }
  return <PendingAdviceNotice t={t} catalog={catalog} />
}
