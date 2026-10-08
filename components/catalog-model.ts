'use client'
import type * as CatalogTypes from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'

import {
  decideCatalogProposals,
  probeCatalogProvider,
  runCatalogAction,
  saveCatalogSettings,
  showCatalogRun,
  startCatalogRun,
} from './catalog-actions'
import { patchCatalogForm, toggleCatalogSetting } from './catalog-form'
import { useCatalogLoader } from './catalog-loader'
import { useCatalogState } from './catalog-state'

type UseCatalogModelContext = {
  ready: boolean
  api: Api
  t: Messages
}

type UseCatalogModelResult = {
  patch: (next: Partial<CatalogTypes.FormState>) => void
  switchToggle: (id: string, value: boolean) => void
  save: () => Promise<void>
  test: () => Promise<void>
  load: (offset: number) => Promise<void>
  decideBulk: (decision: 'approve' | 'reject', advice?: string) => Promise<void>
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  openRunDetail: (runId: string, offset?: number) => Promise<void>
  confirmStartRun: () => Promise<void>
  settings: CatalogTypes.CatalogSettings | null
  setSettings: React.Dispatch<React.SetStateAction<CatalogTypes.CatalogSettings | null>>
  catalog: CatalogTypes.CatalogView | null
  setCatalog: React.Dispatch<React.SetStateAction<CatalogTypes.CatalogView | null>>
  runs: CatalogTypes.RunSummary[]
  setRuns: React.Dispatch<React.SetStateAction<CatalogTypes.RunSummary[]>>
  runsTotal: number
  setRunsTotal: React.Dispatch<React.SetStateAction<number>>
  runsOffset: number
  setRunsOffset: React.Dispatch<React.SetStateAction<number>>
  proposals: CatalogTypes.Proposal[]
  setProposals: React.Dispatch<React.SetStateAction<CatalogTypes.Proposal[]>>
  proposalsSplit: boolean
  setProposalsSplit: React.Dispatch<React.SetStateAction<boolean>>
  metrics: CatalogTypes.Metrics | null
  setMetrics: React.Dispatch<React.SetStateAction<CatalogTypes.Metrics | null>>
  detail: CatalogTypes.RunDetail | null
  setDetail: React.Dispatch<React.SetStateAction<CatalogTypes.RunDetail | null>>
  form: CatalogTypes.FormState | null
  setForm: React.Dispatch<React.SetStateAction<CatalogTypes.FormState | null>>
  formOpen: boolean
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  probe: CatalogTypes.ProbeResult | null
  setProbe: React.Dispatch<React.SetStateAction<CatalogTypes.ProbeResult | null>>
  error: string
  setError: React.Dispatch<React.SetStateAction<string>>
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  hydratedRef: React.RefObject<boolean>
  busy: boolean
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  runDialog: { dryRun: boolean } | null
  setRunDialog: React.Dispatch<React.SetStateAction<{ dryRun: boolean } | null>>
  runPrompt: string
  setRunPrompt: React.Dispatch<React.SetStateAction<string>>
  adviceDialog: boolean
  setAdviceDialog: React.Dispatch<React.SetStateAction<boolean>>
  adviceText: string
  setAdviceText: React.Dispatch<React.SetStateAction<string>>
}

export function useCatalogModel(context: UseCatalogModelContext): UseCatalogModelResult {
  const { ready, api, t } = context
  const state = useCatalogState(ready)
  const load = useCatalogLoader(state, api, t, ready)
  return { ...state, ...catalogCommands(state, api, t, load) }
}

function catalogCommands(
  state: ReturnType<typeof useCatalogState>,
  api: Api,
  t: Messages,
  load: (offset: number) => Promise<void>,
) {
  const {
    setSettings,
    runsOffset,
    setDetail,
    form,
    setForm,
    setProbe,
    setBusy,
    runDialog,
    setRunDialog,
    runPrompt,
    setRunPrompt,
    setAdviceDialog,
    setAdviceText,
  } = state
  const run = async (
    action: () => Promise<void>,
    done?: string,
  ) => await runCatalogAction({ setBusy, t }, action, done)

  const patch = (next: Partial<CatalogTypes.FormState>) => patchCatalogForm({ setForm }, next)

  const switchToggle = (id: string, value: boolean) => toggleCatalogSetting({ patch }, id, value)

  const save = async () => await saveCatalogSettings({ form, run, api, setSettings, setForm, load, runsOffset, t })

  const test = async () => await probeCatalogProvider({ setProbe, run, api, load, runsOffset })

  const confirmStartRun = async () => await startCatalogRun({
    runDialog,
    runPrompt,
    setRunDialog,
    setRunPrompt,
    run,
    api,
    t,
    load,
  })

  const openRunDetail = async (
    runId: string,
    offset: number = 0,
  ) => await showCatalogRun({ run, setDetail, api }, runId, offset)

  const decideBulk = async (
    decision: 'approve' | 'reject',
    advice?: string,
  ) => await decideCatalogProposals(
    { run, api, setAdviceDialog, setAdviceText, load, runsOffset, t },
    decision,
    advice,
  )
  return { patch, switchToggle, save, test, load, decideBulk, run, openRunDetail, confirmStartRun }
}
