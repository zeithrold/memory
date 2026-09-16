'use client'

import type { Api } from './dashboard'
import type { Messages } from '@/lib/i18n/messages'
import { Check, FolderTree, Play, RotateCcw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

/**
 * The catalog tab.
 *
 * The whole surface is session-only on the server, so this panel never runs for
 * an agent token. It reads the settings, the catalog tree, the run history and
 * the pending suggestions together, then polls only while a run is in flight:
 * a maintenance run produces a list of applied changes, and watching it arrive
 * is worth a three-second poll, not a socket.
 */
interface CatalogSettings {
  enabled: boolean
  provider: 'none' | 'openai-compatible' | 'workers-ai'
  baseUrl: string | null
  model: string | null
  hasApiKey: boolean
  apiKeyHint: string | null
  includeContent: boolean
  intervalMinutes: number
  maxBatch: number
  maxTurns: number
  maxToolCalls: number
  autoApplyStructural: boolean
  dryRunUntilReviewed: boolean
  lastProbeAt: string | null
  lastProbeOk: boolean | null
  lastProbeError: string | null
  canStoreKey: boolean
}
interface CategoryView {
  id: string
  parentId: string | null
  depth: number
  slug: string
  label: string
  description: string
  boundary: string
  memberCount: number
  state: string
  createdBy: string
}
interface CatalogView {
  version: number
  updatedAt: string | null
  categories: CategoryView[]
  assigned: number
  orphans: number
  skipped: number
  pendingProposals: number
}
interface RunSummary {
  id: string
  trigger: string
  mode: string
  status: string
  provider: string | null
  model: string | null
  batches: number
  turns: number
  toolCalls: number
  rejected: number
  memoriesSeen: number
  actionsApplied: number
  unorganized: number
  errorCode: string | null
  startedAt: string
  finishedAt: string | null
}
interface TimelineAction {
  id: number
  tool: string
  kind: string
  effect: string
  decision: string
  policyReason: string | null
  rationale: string | null
  memoryId: string | null
  memoryTitle: string | null
  categoryLabel: string | null
  targetCategoryLabel: string | null
  targetProject: string | null
}
interface RunDetail {
  run: RunSummary
  timeline: { batch: number, turn: number, content: string | null, actions: TimelineAction[] }[]
}
interface Proposal {
  id: string
  kind: string
  status: string
  evidenceRuns: number
  rationale: string | null
  targetProject: string | null
}
interface Metrics {
  totals: Record<string, number>
  daily: { day: string, runs: number, applied: number, rejected: number, reassignments: number, orphan_count: number }[]
}

const ACTIVE_RUN_STATES = new Set(['queued', 'running'])

export function CatalogPanel({
  t,
  api,
  ready,
}: {
  t: Messages
  api: Api
  ready: boolean
}) {
  const [settings, setSettings] = useState<CatalogSettings | null>(null)
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [error, setError] = useState('')
  const [probe, setProbe] = useState('')
  const [loading, setLoading] = useState(ready)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!ready)
      return
    try {
      const [nextSettings, nextCatalog, nextRuns, nextProposals, nextMetrics] = await Promise.all([
        api<CatalogSettings>('catalog/settings'),
        api<CatalogView>('catalog'),
        api<{ runs: RunSummary[] }>('catalog/runs'),
        api<{ proposals: Proposal[] }>('catalog/proposals'),
        api<Metrics>('catalog/metrics'),
      ])
      setSettings(nextSettings)
      setCatalog(nextCatalog)
      setRuns(nextRuns.runs)
      setProposals(nextProposals.proposals)
      setMetrics(nextMetrics)
      setError('')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setLoading(false)
    }
  }, [api, ready, t.loadError])

  useEffect(() => {
    void load()
  }, [load])

  // Poll only while something is actually moving.
  const active = runs.some(run => ACTIVE_RUN_STATES.has(run.status))
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!active) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = setInterval(() => {
      void load()
    }, 3000)
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [active, load])

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true)
    try {
      await action()
      if (done !== undefined)
        toast.success(done)
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setBusy(false)
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const provider = String(form.get('provider') ?? 'none')
    const apiKey = String(form.get('apiKey') ?? '')
    await run(async () => {
      setSettings(await api<CatalogSettings>('catalog/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider,
          baseUrl: String(form.get('baseUrl') ?? ''),
          model: String(form.get('model') ?? ''),
          enabled: form.get('enabled') === 'on',
          includeContent: form.get('includeContent') === 'on',
          autoApplyStructural: form.get('autoApplyStructural') === 'on',
          dryRunUntilReviewed: form.get('dryRunUntilReviewed') === 'on',
          intervalMinutes: Number(form.get('intervalMinutes') ?? 30),
          maxBatch: Number(form.get('maxBatch') ?? 10),
          maxTurns: Number(form.get('maxTurns') ?? 3),
          ...(apiKey.length > 0 ? { apiKey } : {}),
        }),
      }))
      await load()
    }, t.settingsSaved)
  }

  async function test() {
    setProbe('')
    await run(async () => {
      const result = await api<{ reachable: boolean, modelOk: boolean, toolCallingOk: boolean, detail: string }>(
        'catalog/settings/test',
        { method: 'POST', body: JSON.stringify({}) },
      )
      setProbe(result.detail)
      await load()
    })
  }

  async function startRun(dryRun: boolean) {
    await run(async () => {
      await api('catalog/runs', { method: 'POST', body: JSON.stringify({ dryRun }) })
      await load()
    }, t.runStarted)
  }

  // A skeleton is only honest while a request is actually outstanding. Without
  // a session nothing is loading, so the panel explains itself rather than
  // shimmering forever (an endless animation also keeps the page from ever
  // settling, which makes it unclickable for a driver).
  if (ready && loading) {
    return (
      <div className="skeleton-stack">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-line" />
      </div>
    )
  }

  const roots = (catalog?.categories ?? []).filter(category => category.parentId === null)
  const childrenOf = (id: string) => (catalog?.categories ?? []).filter(category => category.parentId === id)

  return (
    <>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

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

      <div className="card-actions">
        <Button disabled={busy || !settings?.enabled} onClick={() => void startRun(false)}>
          <Play size={16} />
          {t.runNow}
        </Button>
        <Button variant="secondary" disabled={busy || !settings?.enabled} onClick={() => void startRun(true)}>
          {t.dryRun}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void test()}>
          {t.testConnection}
        </Button>
        <Button variant="ghost" onClick={() => void load()}>
          {t.refresh}
        </Button>
      </div>
      {probe.length > 0 && <p className="muted">{probe}</p>}
      <p className="muted">{t.budgetNote}</p>

      <section className="detail-history">
        <h2 className="section-heading">{t.categories}</h2>
        {roots.length === 0
          ? (
              <div className="empty-state">
                <FolderTree size={28} />
                <h2>{t.noCategories}</h2>
                <p className="muted">{t.notConfigured}</p>
              </div>
            )
          : (
              <ul className="catalog-tree">
                {roots.map(root => (
                  <li key={root.id} className="catalog-node">
                    <div className="catalog-node-head">
                      <strong>{root.label}</strong>
                      <Badge variant="secondary">{root.memberCount}</Badge>
                      {root.state !== 'active' && <Badge variant="outline">{root.state}</Badge>}
                    </div>
                    <p className="muted">{root.description}</p>
                    <p className="muted">{root.boundary}</p>
                    {childrenOf(root.id).length > 0 && (
                      <ul className="catalog-children">
                        {childrenOf(root.id).map(child => (
                          <li key={child.id}>
                            <span>{child.label}</span>
                            <Badge variant="secondary">{child.memberCount}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="detail-history">
        <h2 className="section-heading">{t.proposals}</h2>
        {proposals.length === 0
          ? <p className="muted">{t.noProposals}</p>
          : (
              <ul className="run-list">
                {proposals.map(proposal => (
                  <li key={proposal.id}>
                    <div className="card-meta">
                      <Badge variant="outline">{proposal.kind}</Badge>
                      <span className="muted">
                        {t.evidence}
                        {': '}
                        {proposal.evidenceRuns}
                      </span>
                    </div>
                    {proposal.rationale !== null && <p>{proposal.rationale}</p>}
                    <div className="card-actions">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(async () => {
                          await api(`catalog/proposals/${proposal.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ decision: 'approve' }),
                          })
                          await load()
                        }, t.proposalDone)}
                      >
                        <Check size={14} />
                        {t.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void run(async () => {
                          await api(`catalog/proposals/${proposal.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ decision: 'reject' }),
                          })
                          await load()
                        }, t.proposalDone)}
                      >
                        {t.reject}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="detail-history">
        <h2 className="section-heading">{t.runs}</h2>
        {runs.length === 0
          ? <p className="muted">{t.noRuns}</p>
          : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.created}</th>
                      <th>{t.runStatus}</th>
                      <th>{t.trigger}</th>
                      <th>{t.turns}</th>
                      <th>{t.toolCalls}</th>
                      <th>{t.rejectedCalls}</th>
                      <th>{t.actionsApplied}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(row => (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => void run(async () => {
                              setDetail(await api<RunDetail>(`catalog/runs/${row.id}`))
                            })}
                          >
                            {new Date(row.startedAt).toLocaleString()}
                          </button>
                        </td>
                        <td>
                          {row.mode === 'dry_run' && <Badge variant="outline">{t.dryRun}</Badge>}
                          {' '}
                          {row.status}
                          {row.errorCode !== null && <span className="muted">{` (${row.errorCode})`}</span>}
                        </td>
                        <td>{row.trigger}</td>
                        <td>{row.turns}</td>
                        <td>{row.toolCalls}</td>
                        <td>{row.rejected}</td>
                        <td>{row.actionsApplied}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </section>

      {detail !== null && (
        <section className="detail-history">
          <div className="card-actions">
            <h2 className="section-heading">{t.timeline}</h2>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {t.close}
            </Button>
          </div>
          {detail.run.status !== 'running' && detail.run.mode === 'live' && detail.run.actionsApplied > 0 && (
            <ConfirmAction
              label={t.revertRun}
              description={t.revertConfirm}
              cancel={t.cancel}
              disabled={busy}
              onConfirm={() => void run(async () => {
                await api(`catalog/runs/${detail.run.id}/revert`, { method: 'POST' })
                setDetail(null)
                await load()
              }, t.revertDone)}
            />
          )}
          <ol className="timeline">
            {detail.timeline.map(turn => (
              <li key={`${detail.run.id}:${turn.batch}:${turn.turn}`} className="timeline-turn">
                {turn.content !== null && turn.content.length > 0 && <p>{turn.content}</p>}
                {turn.actions.map(action => (
                  <div
                    key={action.id}
                    className={`timeline-call${action.decision === 'rejected_by_policy' || action.decision === 'rejected_by_user' ? ' call-rejected' : ''}`}
                  >
                    <div className="card-meta">
                      <code>{action.tool}</code>
                      <Badge variant="outline">{action.decision}</Badge>
                      {action.memoryTitle !== null && <span>{action.memoryTitle}</span>}
                      {action.categoryLabel !== null && <span>{`→ ${action.categoryLabel}`}</span>}
                      {action.targetCategoryLabel !== null && <span>{`→ ${action.targetCategoryLabel}`}</span>}
                      {action.targetProject !== null && <span>{`→ ${action.targetProject}`}</span>}
                    </div>
                    {action.rationale !== null && <p className="muted">{action.rationale}</p>}
                    {action.policyReason !== null && (
                      <p className="muted">
                        <ShieldAlert size={14} />
                        {' '}
                        {action.policyReason}
                      </p>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}

      {metrics !== null && metrics.daily.length > 0 && (
        <section className="detail-history">
          <h2 className="section-heading">{t.metrics}</h2>
          <p className="muted">{t.metricsNote}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.day}</th>
                  <th>{t.runs}</th>
                  <th>{t.actionsApplied}</th>
                  <th>{t.rejectedCalls}</th>
                  <th>{t.unclassified}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.daily.slice(0, 14).map(row => (
                  <tr key={row.day}>
                    <td>{row.day}</td>
                    <td>{row.runs}</td>
                    <td>{row.applied}</td>
                    <td>{row.rejected}</td>
                    <td>{row.orphan_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="detail-history">
        <div className="card-actions">
          <h2 className="section-heading">{t.catalogSettings}</h2>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(value => !value)}>
            {expanded ? t.collapse : t.expand}
          </Button>
        </div>
        {!settings?.canStoreKey && (
          <p className="error-banner" role="alert">{t.keyUnavailable}</p>
        )}
        {settings !== null && settings.lastProbeAt !== null && settings.lastProbeError !== null && (
          <p className="muted">{`${t.lastProbe}: ${settings.lastProbeError}`}</p>
        )}
        <form className="editor" onSubmit={event => void save(event)} hidden={!expanded}>
          <div className="form-grid">
            <div className="field">
              <Label htmlFor="catalog-provider">{t.provider}</Label>
              <select
                id="catalog-provider"
                name="provider"
                className="project-input"
                defaultValue={settings?.provider ?? 'none'}
              >
                <option value="none">{t.providerNone}</option>
                <option value="openai-compatible">{t.providerOpenAi}</option>
                <option value="workers-ai">{t.providerWorkersAi}</option>
              </select>
            </div>
            <div className="field">
              <Label htmlFor="catalog-base">{t.baseUrl}</Label>
              <Input id="catalog-base" name="baseUrl" defaultValue={settings?.baseUrl ?? ''} placeholder="https://api.deepseek.com" />
            </div>
            <div className="field">
              <Label htmlFor="catalog-model">{t.model}</Label>
              <Input id="catalog-model" name="model" defaultValue={settings?.model ?? ''} placeholder="deepseek-chat" />
            </div>
            <div className="field">
              <Label htmlFor="catalog-key">{t.apiKey}</Label>
              <Input
                id="catalog-key"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={settings?.hasApiKey === true ? `${t.storedKey} ${settings.apiKeyHint ?? ''}` : ''}
              />
            </div>
            <div className="field">
              <Label htmlFor="catalog-interval">{t.interval}</Label>
              <Input id="catalog-interval" name="intervalMinutes" type="number" min={15} max={1440} defaultValue={settings?.intervalMinutes ?? 30} />
            </div>
            <div className="field">
              <Label htmlFor="catalog-batch">{t.maxBatch}</Label>
              <Input id="catalog-batch" name="maxBatch" type="number" min={1} max={25} defaultValue={settings?.maxBatch ?? 10} />
            </div>
            <div className="field">
              <Label htmlFor="catalog-turns">{t.maxTurns}</Label>
              <Input id="catalog-turns" name="maxTurns" type="number" min={1} max={8} defaultValue={settings?.maxTurns ?? 3} />
            </div>
          </div>
          <div className="scope-choices">
            <label>
              <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} />
              <span>{t.enableCatalog}</span>
            </label>
            <label>
              <input type="checkbox" name="includeContent" defaultChecked={settings?.includeContent ?? false} />
              <span>{t.includeContent}</span>
            </label>
            <label>
              <input type="checkbox" name="autoApplyStructural" defaultChecked={settings?.autoApplyStructural ?? false} />
              <span>{t.autoApply}</span>
            </label>
            <label>
              <input type="checkbox" name="dryRunUntilReviewed" defaultChecked={settings?.dryRunUntilReviewed ?? true} />
              <span>{t.dryRunUntilReviewed}</span>
            </label>
          </div>
          <p className="muted">{t.includeContentHint}</p>
          <p className="muted">{t.providerNeedsPaid}</p>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              <RotateCcw size={14} />
              {t.saveSettings}
            </Button>
          </div>
        </form>
      </section>
    </>
  )
}
