'use client'
import type { CatalogSettings, CatalogView } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './ui/alert'

const STATS_CLASS = [
  'stats grid grid-cols-[repeat(3,_1fr)] gap-4 mb-6 [&_>_div]:bg-card [&_>_div]:border',
  '[&_>_div]:border-border [&_>_div]:p-6 [&_>_div]:rounded-md [&_span]:block [&_span]:text-control',
  '[&_span]:text-muted-foreground [&_strong]:block [&_strong]:mt-3 [&_strong]:font-medium',
  '[&_strong]:text-[length:32px] max-[640px]:gap-2 max-[640px]:[&_>_div]:py-4 max-[640px]:[&_>_div]:px-3',
  'max-[640px]:[&_span]:text-help max-[640px]:[&_strong]:text-[length:25px]',
  'max-[640px]:grid-cols-[minmax(0,_1fr)]',
].join(' ')

export function CatalogStats({ t, catalog }: CatalogStatsProps): React.JSX.Element {
  return (
    <div className={STATS_CLASS}>
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

type PendingAdviceNoticeProps = {
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

type CatalogStatsProps = {
  t: Messages
  catalog: CatalogView | null
}

type CatalogBudgetNoticeProps = {
  settings: CatalogSettings
  t: Messages
}

type CatalogNoticesProps = {
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
