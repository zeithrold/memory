'use client'
import type { CatalogSettings, FormState, ProbeResult, RunDetail } from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import { toast } from 'sonner'
import {
  catalogBudgetResponse,
  catalogProbeResponse,
  catalogRunResponse,
  catalogSettingsResponse,
  ignoredResponse,
} from './api-schemas'
import { STEPS_PAGE } from './catalog-constants'
import { formFrom } from './catalog-form'

type RunCatalogActionContext = {
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  t: Messages
}

export async function runCatalogAction(
  context: RunCatalogActionContext,
  action: () => Promise<void>,
  done?: string,
): Promise<void> {
  const { setBusy, t } = context

  setBusy(true)
  try {
    await action()
    if (done !== undefined) {
      toast.success(done)
    }
  }
  catch (err) {
    toast.error(err instanceof Error ? err.message : t.loadError)
  }
  finally {
    setBusy(false)
  }
}

type SaveCatalogSettingsContext = {
  form: FormState | null
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  setSettings: React.Dispatch<React.SetStateAction<CatalogSettings | null>>
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
  t: Messages
}

export async function saveCatalogSettings(context: SaveCatalogSettingsContext): Promise<void> {
  const { form, run, api, setSettings, setForm, load, runsOffset, t } = context

  if (form === null) {
    return
  }
  await run(async () => {
    const saved = await api('catalog/settings', catalogSettingsResponse, {
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

type ProbeCatalogProviderContext = {
  setProbe: React.Dispatch<React.SetStateAction<ProbeResult | null>>
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
}

export async function probeCatalogProvider(
  context: ProbeCatalogProviderContext,
): Promise<void> {
  const { setProbe, run, api, load, runsOffset } = context

  setProbe(null)
  await run(async () => {
    setProbe(await api('catalog/settings/test', catalogProbeResponse, {
      method: 'POST',
      body: JSON.stringify({}),
    }))
    await load(runsOffset)
  })
}

type StartCatalogRunContext = {
  runDialog: { dryRun: boolean } | null
  runPrompt: string
  setRunDialog: React.Dispatch<React.SetStateAction<{ dryRun: boolean } | null>>
  setRunPrompt: React.Dispatch<React.SetStateAction<string>>
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  t: Messages
  load: (nextRunsOffset: number) => Promise<void>
}

export async function startCatalogRun(context: StartCatalogRunContext): Promise<void> {
  const { runDialog, runPrompt, setRunDialog, setRunPrompt, run, api, t, load } = context

  if (runDialog === null) {
    return
  }
  const dryRun = runDialog.dryRun
  const prompt = runPrompt.trim()
  setRunDialog(null)
  setRunPrompt('')
  await run(async () => {
    const started = await api('catalog/runs', catalogBudgetResponse, {
      method: 'POST',
      body: JSON.stringify({
        dryRun,
        ...(prompt.length > 0 ? { prompt } : {}),
      }),
    })
    if (started.budgetWarning) {
      toast.warning(t.manualBudgetWarning)
    }
    await load(0)
  }, t.runStarted)
}

type ShowCatalogRunContext = {
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  setDetail: React.Dispatch<React.SetStateAction<RunDetail | null>>
  api: Api
}

export async function showCatalogRun(
  context: ShowCatalogRunContext,
  runId: string,
  offset: number = 0,
): Promise<void> {
  const { run, setDetail, api } = context

  await run(async () => {
    setDetail(await api(
      `catalog/runs/${runId}?offset=${offset}&limit=${STEPS_PAGE}`,
      catalogRunResponse,
    ))
  })
}

type DecideCatalogProposalsContext = {
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  setAdviceDialog: React.Dispatch<React.SetStateAction<boolean>>
  setAdviceText: React.Dispatch<React.SetStateAction<string>>
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
  t: Messages
}

export async function decideCatalogProposals(
  context: DecideCatalogProposalsContext,
  decision: 'approve' | 'reject',
  advice?: string,
): Promise<void> {
  const { run, api, setAdviceDialog, setAdviceText, load, runsOffset, t } = context

  await run(async () => {
    await api('catalog/proposals', ignoredResponse, {
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
