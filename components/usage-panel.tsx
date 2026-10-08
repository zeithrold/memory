'use client'

import type { Api } from './workspace-shell'

import type { UsageSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { useEffect, useState } from 'react'
import { statusResponse, usageResponse } from './api-schemas'
import { UsageSkeleton } from './skeletons'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const STATS_CLASS = [
  'stats grid grid-cols-[repeat(3,_1fr)] gap-4 mb-6 [&_>_div]:bg-card [&_>_div]:border',
  '[&_>_div]:border-border [&_>_div]:p-6 [&_>_div]:rounded-md [&_span]:block [&_span]:text-control',
  '[&_span]:text-muted-foreground [&_strong]:block [&_strong]:mt-3 [&_strong]:font-medium',
  '[&_strong]:text-[length:32px] max-[640px]:gap-2 max-[640px]:[&_>_div]:py-4 max-[640px]:[&_>_div]:px-3',
  'max-[640px]:[&_span]:text-help max-[640px]:[&_strong]:text-[length:25px]',
  'max-[640px]:grid-cols-[minmax(0,_1fr)]',
].join(' ')

const ERROR_BANNER_CLASS = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

const ERROR_BANNER_CLASS_1 = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

const EMPTY_STATE_CLASS = [
  'empty-state min-h-[330px] flex flex-col items-center justify-center text-center py-10 px-4 [&_h2]:mt-1',
  '[&_h2]:mx-0 [&_h2]:mb-2 [&_h2]:text-[length:19px] [&_p]:text-muted-foreground [&_p]:text-body',
  '[&_p]:leading-[1.9] [&_p]:max-w-[350px] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-6 max-[640px]:min-h-70',
].join(' ')

function connectionLabel(
  row: UsageSummary,
  t: Messages,
): string {
  if (row.token_name !== null && row.token_name.length > 0) {
    return row.token_name
  }
  if (row.client_id !== null && row.client_id.length > 0) {
    try {
      return `${t.oauthClient} · ${new URL(row.client_id).host}`
    }
    catch {
      return `${t.oauthClient} · ${row.client_id.slice(0, 8)}`
    }
  }
  return row.token_id !== null && row.token_id.length > 0 ? row.token_id.slice(0, 8) : t.webSession
}

type UsagePanelProps = { t: Messages, api: Api, ready: boolean }

type UsageTableProps = {
  t: Messages
  usage: UsageSummary[]
}

function UsageTable(
  { t, usage }: UsageTableProps,
): React.JSX.Element {
  return (
    <div className="table-wrap overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>{t.day}</th>
            <th>{t.tokenName}</th>
            <th>{t.operation}</th>
            <th>{t.calls}</th>
            <th>{t.errors}</th>
            <th>{t.latency}</th>
          </tr>
        </thead>
        <tbody>
          {usage.map(

            row => (
              <tr key={`${row.day}:${row.token_id ?? 'null'}:${row.client_id ?? 'null'}:${row.operation}`}>
                <td>{row.day}</td>
                <td>
                  {connectionLabel(row, t,

                  )}
                </td>
                <td><code>{row.operation}</code></td>
                <td>{row.calls}</td>
                <td>{row.errors}</td>
                <td>
                  {row.average_ms}
                  {' '}
                  ms
                </td>
              </tr>
            ),

          )}
        </tbody>
      </table>
    </div>
  )
}

type UsageStatisticsProps = {
  t: Messages
  total: number
  errors: number
  pending: number
}

function UsageStatistics({ t, total, errors, pending }: UsageStatisticsProps): React.JSX.Element {
  return (
    <div className={STATS_CLASS}>
      <div>
        <span>{t.calls}</span>
        <strong>{total}</strong>
      </div>
      <div>
        <span>{t.errors}</span>
        <strong>{errors}</strong>
      </div>
      <div>
        <span>{t.pending}</span>
        <strong>{pending}</strong>
      </div>
    </div>
  )
}
type UsageState = {
  usage: UsageSummary[]
  error: string
  pending: number
  degraded: boolean
  loading: boolean
}

function useUsage(api: Api, ready: boolean, loadError: string): UsageState {
  const [usage, setUsage] = useState<UsageSummary[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [degraded, setDegraded] = useState(false)
  const [loading, setLoading] = useState(ready)
  useEffect(
    () => {
      if (!ready) {
        return
      }
      let active = true
      void Promise.all([
        api('usage', usageResponse),
        api('status', statusResponse),
      ]).then(([result, status]) => {
        if (active) {
          setUsage(result.usage)
          setDegraded(result.degraded)
          setPending(status.index.pending)
        }
      }).catch(
        (err: unknown) => active && setError(err instanceof Error ? err.message : loadError),
      ).finally(
        () => active && setLoading(false),
      )
      return () => {
        active = false
      }
    },
    [
      api,
      ready,
      loadError,
    ],
  )
  return { usage, error, pending, degraded, loading }
}

export function UsagePanel(
  { t, api, ready }: UsagePanelProps,
): React.JSX.Element {
  const { usage, error, pending, degraded, loading } = useUsage(api, ready, t.loadError)
  const total = usage.reduce((sum, row) => sum + row.calls, 0)
  const errors = usage.reduce((sum, row) => sum + row.errors, 0)
  if (loading) {
    return <UsageSkeleton />
  }
  return (
    <>
      {(error.length > 0) && (
        <p
          className={ERROR_BANNER_CLASS}
          role="alert"
        >
          {error}
        </p>
      )}
      {degraded && (
        <p
          className={ERROR_BANNER_CLASS_1}
          role="status"
        >
          {t.usageNote}
        </p>
      )}
      <UsageStatistics t={t} total={total} errors={errors} pending={pending} />
      <p className={MUTED_CLASS}>{t.usageNote}</p>
      {usage.length === 0
        ? (
            <div className={EMPTY_STATE_CLASS}>
              <h2>{t.noUsage}</h2>
            </div>
          )
        : (
            <UsageTable t={t} usage={usage} />
          )}
    </>
  )
}
