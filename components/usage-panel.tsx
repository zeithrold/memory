'use client'

import type { Api } from './workspace-shell'

import type { UsageSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { useEffect, useState } from 'react'
import { statusResponse, usageResponse } from './api-schemas'
import { UsageSkeleton } from './skeletons'

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

interface UsagePanelProps { t: Messages, api: Api, ready: boolean }

interface UsageTableProps {
  t: Messages
  usage: UsageSummary[]
}

function UsageTable(
  { t, usage }: UsageTableProps,
): React.JSX.Element {
  return (
    <div className="table-wrap">
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

interface UsageStatisticsProps {
  t: Messages
  total: number
  errors: number
  pending: number
}

function UsageStatistics({ t, total, errors, pending }: UsageStatisticsProps): React.JSX.Element {
  return (
    <div className="stats">
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
export function UsagePanel(
  { t, api, ready }: UsagePanelProps,
): React.JSX.Element {
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
        (err: unknown) => active && setError(err instanceof Error ? err.message : t.loadError),
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
      t.loadError,
    ],
  )
  const total = usage.reduce((sum, row) => sum + row.calls, 0)
  const errors = usage.reduce((sum, row) => sum + row.errors, 0)
  if (loading) {
    return <UsageSkeleton />
  }
  return (
    <>
      {(error.length > 0) && <p className="error-banner" role="alert">{error}</p>}
      {degraded && <p className="error-banner" role="status">{t.usageNote}</p>}
      <UsageStatistics t={t} total={total} errors={errors} pending={pending} />
      <p className="muted">{t.usageNote}</p>
      {usage.length === 0
        ? <div className="empty-state"><h2>{t.noUsage}</h2></div>
        : (
            <UsageTable t={t} usage={usage} />
          )}
    </>
  )
}
