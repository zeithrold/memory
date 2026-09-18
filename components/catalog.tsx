'use client'

import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import { FolderTree, Play, RotateCcw, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Textarea } from './ui/textarea'

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
  axisHint: string | null
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
  pendingAdvice: string | null
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
  totalActions: number
  offset: number
  limit: number
  operatorPrompt: string | null
}
interface Proposal {
  id: string
  kind: string
  status: string
  evidenceRuns: number
  lastRunId: string
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
const RUNS_PAGE = 20
const STEPS_PAGE = 40

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
  const [runsTotal, setRunsTotal] = useState(0)
  const [runsOffset, setRunsOffset] = useState(0)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalsSplit, setProposalsSplit] = useState(false)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(ready)
  const [busy, setBusy] = useState(false)
  const [runDialog, setRunDialog] = useState<{ dryRun: boolean } | null>(null)
  const [runPrompt, setRunPrompt] = useState('')
  const [adviceDialog, setAdviceDialog] = useState(false)
  const [adviceText, setAdviceText] = useState('')
  const hydratedRef = useRef(false)

  const load = useCallback(async (nextRunsOffset: number) => {
    if (!ready)
      return
    try {
      const [nextSettings, nextCatalog, nextRuns, nextProposals, nextMetrics] = await Promise.all([
        api<CatalogSettings>('catalog/settings'),
        api<CatalogView>('catalog'),
        api<{ runs: RunSummary[], total: number, offset: number, limit: number }>(
          `catalog/runs?limit=${RUNS_PAGE}&offset=${nextRunsOffset}`,
        ),
        api<{ proposals: Proposal[] }>('catalog/proposals'),
        api<Metrics>('catalog/metrics'),
      ])
      setSettings(nextSettings)
      setCatalog(nextCatalog)
      setRuns(nextRuns.runs)
      setRunsTotal(nextRuns.total)
      setRunsOffset(nextRuns.offset)
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
    void load(0)
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
      void load(runsOffset)
    }, 3000)
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [active, load, runsOffset])

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
      await load(runsOffset)
    }, t.settingsSaved)
  }

  async function test() {
    setProbe(null)
    await run(async () => {
      setProbe(await api<ProbeResult>('catalog/settings/test', {
        method: 'POST',
        body: JSON.stringify({}),
      }))
      await load(runsOffset)
    })
  }

  async function confirmStartRun() {
    if (runDialog === null)
      return
    const dryRun = runDialog.dryRun
    const prompt = runPrompt.trim()
    setRunDialog(null)
    setRunPrompt('')
    await run(async () => {
      const started = await api<{ budgetWarning: boolean }>('catalog/runs', {
        method: 'POST',
        body: JSON.stringify({
          dryRun,
          ...(prompt.length > 0 ? { prompt } : {}),
        }),
      })
      if (started.budgetWarning)
        toast.warning(t.manualBudgetWarning)
      await load(0)
    }, t.runStarted)
  }

  async function openRunDetail(runId: string, offset = 0) {
    await run(async () => {
      setDetail(await api<RunDetail>(
        `catalog/runs/${runId}?offset=${offset}&limit=${STEPS_PAGE}`,
      ))
    })
  }

  async function decideBulk(decision: 'approve' | 'reject', advice?: string) {
    await run(async () => {
      await api('catalog/proposals', {
        method: 'POST',
        body: JSON.stringify({
          decision,
          ...(advice !== undefined && advice.trim().length > 0 ? { advice: advice.trim() } : {}),
        }),
      })
      setAdviceDialog(false)
      setAdviceText('')
      await load(runsOffset)
    }, t.proposalDone)
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
      {catalog?.pendingAdvice !== null && catalog?.pendingAdvice !== undefined && catalog.pendingAdvice.length > 0 && (
        <Alert>
          <ShieldAlert />
          <AlertTitle>{t.pendingAdviceHint}</AlertTitle>
          <AlertDescription>{catalog.pendingAdvice}</AlertDescription>
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
        <Button disabled={busy} onClick={() => setRunDialog({ dryRun: false })}>
          <Play size={16} />
          {t.runNow}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setRunDialog({ dryRun: true })}>
          {t.dryRun}
        </Button>
        <Button variant="ghost" onClick={() => void load(runsOffset)}>
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
                <div className="catalog-card-grid">
                  {roots.map(root => (
                    <Link
                      key={root.id}
                      href={`/catalog/${root.id}`}
                      prefetch={false}
                      className="catalog-category-card"
                    >
                      <div className="catalog-node-head">
                        <strong>{root.label}</strong>
                        <Badge variant="secondary">{root.memberCount}</Badge>
                        {root.state !== 'active' && <Badge variant="outline">{root.state}</Badge>}
                      </div>
                      <p className="muted">{root.description}</p>
                      <p className="muted">
                        <strong>{t.categoryBoundary}</strong>
                        {': '}
                        {root.boundary}
                      </p>
                      {root.axisHint !== null && root.axisHint.length > 0 && (
                        <p className="muted">
                          <strong>{t.categoryAxis}</strong>
                          {': '}
                          {root.axisHint}
                        </p>
                      )}
                      <p className="muted">
                        {t.childCategories}
                        {': '}
                        {childrenOf(root.id).length}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.proposals}</CardTitle>
          <CardDescription>{t.packageHint}</CardDescription>
          {proposals.length > 0 && (
            <CardAction>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setProposalsSplit(value => !value)}
              >
                {proposalsSplit ? t.joinProposals : t.splitProposals}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {proposals.length === 0
            ? <p className="muted">{t.noProposals}</p>
            : (
                <>
                  {!proposalsSplit && (
                    <div className="card-actions">
                      <Button size="sm" disabled={busy} onClick={() => void decideBulk('approve')}>
                        {t.acceptPackage}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decideBulk('reject')}>
                        {t.rejectPackage}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAdviceDialog(true)}>
                        {t.rejectWithAdvice}
                      </Button>
                    </div>
                  )}
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
                        {proposalsSplit && (
                          <div className="card-actions">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void run(async () => {
                                await api(`catalog/proposals/${proposal.id}`, {
                                  method: 'POST',
                                  body: JSON.stringify({ decision: 'approve' }),
                                })
                                await load(runsOffset)
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
                                await load(runsOffset)
                              }, t.proposalDone)}
                            >
                              {t.reject}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.runs}</CardTitle>
          <CardAction>
            <Button size="sm" variant="ghost" onClick={() => void load(runsOffset)}>
              {t.refresh}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
                            onClick={() => void openRunDetail(row.id)}
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
          {(runsOffset > 0 || runsOffset + runs.length < runsTotal) && (
            <div className="pagination">
              <Button
                variant="ghost"
                disabled={runsOffset === 0 || busy}
                onClick={() => void load(Math.max(0, runsOffset - RUNS_PAGE))}
              >
                {t.previous}
              </Button>
              <Button
                variant="ghost"
                disabled={runsOffset + runs.length >= runsTotal || busy}
                onClick={() => void load(runsOffset + RUNS_PAGE)}
              >
                {t.next}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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

      <Dialog
        open={runDialog !== null}
        onOpenChange={(open) => {
          if (!open)
            setRunDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.runPromptTitle}</DialogTitle>
            <DialogDescription>{t.runPromptHint}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="catalog-run-prompt">{t.runPromptTitle}</Label>
            <Textarea
              id="catalog-run-prompt"
              value={runPrompt}
              placeholder={t.runPromptPlaceholder}
              onChange={event => setRunPrompt(event.target.value)}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRunDialog(null)}>{t.cancel}</Button>
            <Button disabled={busy || !configured} onClick={() => void confirmStartRun()}>
              {runDialog?.dryRun === true ? t.dryRun : t.startRun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adviceDialog} onOpenChange={setAdviceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.rejectWithAdvice}</DialogTitle>
            <DialogDescription>{t.adviceLabel}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={adviceText}
            placeholder={t.advicePlaceholder}
            onChange={event => setAdviceText(event.target.value)}
            maxLength={2000}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdviceDialog(false)}>{t.cancel}</Button>
            <Button
              disabled={busy || adviceText.trim().length === 0}
              onClick={() => void decideBulk('reject', adviceText)}
            >
              {t.rejectWithAdvice}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open)
            setDetail(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {detail !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{t.timeline}</DialogTitle>
                <DialogDescription>{new Date(detail.run.startedAt).toLocaleString()}</DialogDescription>
              </DialogHeader>
              {detail.operatorPrompt !== null && detail.operatorPrompt.length > 0 && (
                <p className="muted">{detail.operatorPrompt}</p>
              )}
              {detail.run.status !== 'running' && detail.run.mode === 'live' && detail.run.actionsApplied > 0 && (
                <ConfirmAction
                  label={t.revertRun}
                  description={t.revertConfirm}
                  cancel={t.cancel}
                  disabled={busy}
                  onConfirm={() => void run(async () => {
                    await api(`catalog/runs/${detail.run.id}/revert`, { method: 'POST' })
                    setDetail(null)
                    await load(runsOffset)
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
              {(detail.offset > 0 || detail.offset + detail.timeline.reduce((sum, turn) => sum + turn.actions.length, 0) < detail.totalActions) && (
                <div className="pagination">
                  <Button
                    variant="ghost"
                    disabled={detail.offset === 0 || busy}
                    onClick={() => void openRunDetail(detail.run.id, Math.max(0, detail.offset - STEPS_PAGE))}
                  >
                    {t.previous}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={detail.offset + detail.timeline.reduce((sum, turn) => sum + turn.actions.length, 0) >= detail.totalActions || busy}
                    onClick={() => void openRunDetail(detail.run.id, detail.offset + STEPS_PAGE)}
                  >
                    {t.next}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
