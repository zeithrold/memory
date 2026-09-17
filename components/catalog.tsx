'use client'

import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import { FolderTree, Play, RotateCcw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

/**
 * The catalog tab.
 *
 * The whole surface is session-only on the server, so this panel never runs for
 * an agent token. It reads the settings, the catalog tree, the run history and
 * the pending suggestions together, then polls only while a run is in flight:
 * a maintenance run produces a list of applied changes, and watching it arrive
 * is worth a three-second poll, not a socket.
 *
 * The form is controlled rather than backed by `FormData`, because the controls
 * that matter most here - the provider select and the switches - are Radix
 * components. They are not form elements, so an uncontrolled form would submit
 * nothing for them.
 */
interface CatalogSettings {
  enabled: boolean
  provider: 'none' | 'responses-api' | 'workers-ai'
  baseUrl: string | null
  model: string | null
  hasApiKey: boolean
  apiKeyHint: string | null
  includeContent: boolean
  intervalMinutes: number
  maxBatch: number
  maxTurns: number
  maxToolCalls: number
  dailyTokenBudget: number
  autoApplyStructural: boolean
  dryRunUntilReviewed: boolean
  awaitingReview: boolean
  failureStreak: number
  todayTokens: number
  tokenUsageComplete: boolean
  budgetExceeded: boolean
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
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  usageMissingTurns: number
  tokenUsageComplete: boolean
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
  daily: { day: string, runs: number, applied: number, rejected: number, reassignments: number, orphan_count: number, prompt_tokens: number, completion_tokens: number, usage_missing_turns: number }[]
}
interface ProbeResult {
  reachable: boolean
  modelOk: boolean
  toolCallingOk: boolean
  detail: string
}
interface FormState {
  provider: CatalogSettings['provider']
  baseUrl: string
  model: string
  apiKey: string
  includeContent: boolean
  enabled: boolean
  autoApplyStructural: boolean
  dryRunUntilReviewed: boolean
  intervalMinutes: number
  maxBatch: number
  maxTurns: number
  maxToolCalls: number
  dailyTokenBudget: number
}

const ACTIVE_RUN_STATES = new Set(['queued', 'running'])
const REFUSED_DECISIONS = new Set(['rejected_by_policy', 'rejected_by_user'])

function formFrom(settings: CatalogSettings): FormState {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl ?? '',
    model: settings.model ?? '',
    apiKey: '',
    includeContent: settings.includeContent,
    enabled: settings.enabled,
    autoApplyStructural: settings.autoApplyStructural,
    dryRunUntilReviewed: settings.dryRunUntilReviewed,
    intervalMinutes: settings.intervalMinutes,
    maxBatch: settings.maxBatch,
    maxTurns: settings.maxTurns,
    maxToolCalls: settings.maxToolCalls,
    dailyTokenBudget: settings.dailyTokenBudget,
  }
}

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
  const [form, setForm] = useState<FormState | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(ready)
  const [busy, setBusy] = useState(false)
  const hydratedRef = useRef(false)

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
      // Hydrate the form once, so a poll cannot overwrite what is being typed.
      if (!hydratedRef.current) {
        hydratedRef.current = true
        setForm(formFrom(nextSettings))
        // An unconfigured account should land on the form, not on an empty tree.
        setFormOpen(nextSettings.provider === 'none')
      }
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

  function patch(next: Partial<FormState>) {
    setForm(current => (current === null ? current : { ...current, ...next }))
  }

  function switchToggle(id: string, value: boolean) {
    if (id === 'enabled')
      patch({ enabled: value })
    else if (id === 'include-content')
      patch({ includeContent: value })
    else if (id === 'auto-apply')
      patch({ autoApplyStructural: value })
    else
      patch({ dryRunUntilReviewed: value })
  }

  async function save() {
    if (form === null)
      return
    await run(async () => {
      const saved = await api<CatalogSettings>('catalog/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          enabled: form.enabled,
          includeContent: form.includeContent,
          autoApplyStructural: form.autoApplyStructural,
          dryRunUntilReviewed: form.dryRunUntilReviewed,
          intervalMinutes: form.intervalMinutes,
          maxBatch: form.maxBatch,
          maxTurns: form.maxTurns,
          maxToolCalls: form.maxToolCalls,
          dailyTokenBudget: form.dailyTokenBudget,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}),
        }),
      })
      setSettings(saved)
      // Re-sync from the server, which also clears the key field.
      setForm(formFrom(saved))
      await load()
    }, t.settingsSaved)
  }

  async function test() {
    setProbe(null)
    await run(async () => {
      setProbe(await api<ProbeResult>('catalog/settings/test', {
        method: 'POST',
        body: JSON.stringify({}),
      }))
      await load()
    })
  }

  async function startRun(dryRun: boolean) {
    await run(async () => {
      const started = await api<{ budgetWarning: boolean }>('catalog/runs', {
        method: 'POST',
        body: JSON.stringify({ dryRun }),
      })
      if (started.budgetWarning)
        toast.warning(t.manualBudgetWarning)
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
  const configured = settings !== null && settings.provider !== 'none'
  const toggles: [string, string, boolean][] = form === null
    ? []
    : [
        ['enabled', t.enableCatalog, form.enabled],
        ['include-content', t.includeContent, form.includeContent],
        ['auto-apply', t.autoApply, form.autoApplyStructural],
        ['dry-run', t.dryRunUntilReviewed, form.dryRunUntilReviewed],
      ]

  return (
    <div className="flex flex-col gap-6">
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
      {settings?.failureStreak !== undefined && settings.failureStreak > 0 && (
        <Alert>
          <ShieldAlert />
          <AlertTitle>{t.failureBackoff}</AlertTitle>
          <AlertDescription>{`${t.failureBackoffDescription} ${settings.failureStreak}`}</AlertDescription>
        </Alert>
      )}
      {settings !== null && (
        <Alert variant={settings.budgetExceeded ? 'destructive' : 'default'}>
          <ShieldAlert />
          <AlertTitle>{t.dailyTokenBudget}</AlertTitle>
          <AlertDescription>
            {`${settings.todayTokens.toLocaleString()} / ${settings.dailyTokenBudget.toLocaleString()} ${t.modelTokens}`}
            {!settings.tokenUsageComplete && ` · ${t.usageIncomplete}`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.catalogSettings}</CardTitle>
          <CardDescription>{t.settingsDescription}</CardDescription>
          <CardAction>
            <Button size="sm" variant="ghost" onClick={() => setFormOpen(open => !open)}>
              {formOpen ? t.hideSettings : t.showSettings}
            </Button>
          </CardAction>
        </CardHeader>
        {formOpen && form !== null && (
          <CardContent className="flex flex-col gap-6">
            {settings?.canStoreKey === false && (
              <Alert variant="destructive">
                <ShieldAlert />
                <AlertTitle>{t.apiKey}</AlertTitle>
                <AlertDescription>{t.keyUnavailable}</AlertDescription>
              </Alert>
            )}
            {settings !== null && settings.lastProbeAt !== null && settings.lastProbeError !== null && (
              <p className="muted">{`${t.lastProbe}: ${settings.lastProbeError}`}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-provider">{t.provider}</Label>
                <Select
                  value={form.provider}
                  onValueChange={value => patch({
                    provider: value as FormState['provider'],
                    // Clearing the provider cannot leave the agent enabled.
                    ...(value === 'none' ? { enabled: false } : {}),
                  })}
                >
                  <SelectTrigger id="catalog-provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.providerNone}</SelectItem>
                    <SelectItem value="responses-api">{t.providerResponses}</SelectItem>
                    <SelectItem value="workers-ai">{t.providerWorkersAi}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-model">{t.model}</Label>
                <Input
                  id="catalog-model"
                  value={form.model}
                  placeholder={form.provider === 'workers-ai' ? '@cf/zai-org/glm-4.7-flash' : 'your-model-id'}
                  onChange={event => patch({ model: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-base">{t.baseUrl}</Label>
                <Input
                  id="catalog-base"
                  value={form.baseUrl}
                  disabled={form.provider !== 'responses-api'}
                  placeholder="https://api.openai.com/v1"
                  onChange={event => patch({ baseUrl: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-key">{t.apiKey}</Label>
                <Input
                  id="catalog-key"
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  disabled={form.provider !== 'responses-api'}
                  placeholder={settings?.hasApiKey === true ? `${t.storedKey} ${settings.apiKeyHint ?? ''}` : 'sk-...'}
                  onChange={event => patch({ apiKey: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="muted">{t.providerHint}</p>
              <p className="muted">{t.providerNeedsPaid}</p>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              {toggles.map(([id, label, checked]) => (
                <div key={id} className="flex items-start justify-between gap-4">
                  <Label htmlFor={`catalog-${id}`} className="font-normal">
                    {label}
                  </Label>
                  <Switch
                    id={`catalog-${id}`}
                    checked={checked}
                    disabled={id === 'enabled' && form.provider === 'none'}
                    onCheckedChange={value => switchToggle(id, value)}
                  />
                </div>
              ))}
              <p className="muted">{t.includeContentHint}</p>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-interval">{t.interval}</Label>
                <Input
                  id="catalog-interval"
                  type="number"
                  min={30}
                  max={1440}
                  step={30}
                  value={form.intervalMinutes}
                  onChange={event => patch({ intervalMinutes: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-batch">{t.maxBatch}</Label>
                <Input
                  id="catalog-batch"
                  type="number"
                  min={1}
                  max={25}
                  value={form.maxBatch}
                  onChange={event => patch({ maxBatch: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-turns">{t.maxTurns}</Label>
                <Input
                  id="catalog-turns"
                  type="number"
                  min={1}
                  max={8}
                  value={form.maxTurns}
                  onChange={event => patch({ maxTurns: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-tool-calls">{t.maxToolCalls}</Label>
                <Input
                  id="catalog-tool-calls"
                  type="number"
                  min={3}
                  max={24}
                  value={form.maxToolCalls}
                  onChange={event => patch({ maxToolCalls: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="catalog-token-budget">{t.dailyTokenBudget}</Label>
                <Input
                  id="catalog-token-budget"
                  type="number"
                  min={10000}
                  max={5000000}
                  step={10000}
                  value={form.dailyTokenBudget}
                  onChange={event => patch({ dailyTokenBudget: Number(event.target.value) })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy} onClick={() => void save()}>
                <RotateCcw size={14} />
                {t.saveSettings}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void test()}>
                {t.testConnection}
              </Button>
              {probe !== null && (
                <Badge variant={probe.reachable && probe.toolCallingOk ? 'secondary' : 'destructive'}>
                  {probe.toolCallingOk ? t.hybrid : t.keyword}
                </Badge>
              )}
            </div>
            {probe !== null && <p className="muted">{probe.detail}</p>}
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy || !configured} onClick={() => void startRun(false)}>
          <Play size={16} />
          {t.runNow}
        </Button>
        <Button variant="secondary" disabled={busy || !configured} onClick={() => void startRun(true)}>
          {t.dryRun}
        </Button>
        <Button variant="ghost" onClick={() => void load()}>
          {t.refresh}
        </Button>
      </div>
      <p className="muted">{t.budgetNote}</p>

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

      <Card>
        <CardHeader>
          <CardTitle>{t.categories}</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.proposals}</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.runs}</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0
            ? <p className="muted">{t.noRuns}</p>
            : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.created}</TableHead>
                      <TableHead>{t.runStatus}</TableHead>
                      <TableHead>{t.trigger}</TableHead>
                      <TableHead>{t.turns}</TableHead>
                      <TableHead>{t.toolCalls}</TableHead>
                      <TableHead>{t.rejectedCalls}</TableHead>
                      <TableHead>{t.actionsApplied}</TableHead>
                      <TableHead>{t.modelTokens}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map(row => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => void run(async () => {
                              setDetail(await api<RunDetail>(`catalog/runs/${row.id}`))
                            })}
                          >
                            {new Date(row.startedAt).toLocaleString()}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {row.mode === 'dry_run' && <Badge variant="outline">{t.dryRun}</Badge>}
                            <span>{row.status}</span>
                            {row.errorCode !== null && <span className="muted">{row.errorCode}</span>}
                          </div>
                        </TableCell>
                        <TableCell>{row.trigger}</TableCell>
                        <TableCell>{row.turns}</TableCell>
                        <TableCell>{row.toolCalls}</TableCell>
                        <TableCell>{row.rejected}</TableCell>
                        <TableCell>{row.actionsApplied}</TableCell>
                        <TableCell>
                          {row.totalTokens?.toLocaleString() ?? '—'}
                          {!row.tokenUsageComplete && <span className="muted"> *</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
        </CardContent>
      </Card>

      {detail !== null && (
        <Card>
          <CardHeader>
            <CardTitle>{t.timeline}</CardTitle>
            <CardDescription>{new Date(detail.run.startedAt).toLocaleString()}</CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
                {t.close}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
                      className={`timeline-call${REFUSED_DECISIONS.has(action.decision) ? ' call-rejected' : ''}`}
                    >
                      <div className="card-meta">
                        <code>{action.tool}</code>
                        <Badge variant="outline">{action.decision}</Badge>
                        {action.memoryTitle !== null && <span>{action.memoryTitle}</span>}
                        {action.categoryLabel !== null && <span>{`-> ${action.categoryLabel}`}</span>}
                        {action.targetCategoryLabel !== null && <span>{`-> ${action.targetCategoryLabel}`}</span>}
                        {action.targetProject !== null && <span>{`-> ${action.targetProject}`}</span>}
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
          </CardContent>
        </Card>
      )}

      {metrics !== null && metrics.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.metrics}</CardTitle>
            <CardDescription>{t.metricsNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.day}</TableHead>
                  <TableHead>{t.runs}</TableHead>
                  <TableHead>{t.actionsApplied}</TableHead>
                  <TableHead>{t.rejectedCalls}</TableHead>
                  <TableHead>{t.unclassified}</TableHead>
                  <TableHead>{t.modelTokens}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.daily.slice(0, 14).map(row => (
                  <TableRow key={row.day}>
                    <TableCell>{row.day}</TableCell>
                    <TableCell>{row.runs}</TableCell>
                    <TableCell>{row.applied}</TableCell>
                    <TableCell>{row.rejected}</TableCell>
                    <TableCell>{row.orphan_count}</TableCell>
                    <TableCell>
                      {(row.prompt_tokens + row.completion_tokens).toLocaleString()}
                      {row.usage_missing_turns > 0 && <span className="muted"> *</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
