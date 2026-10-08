'use client'
import type * as CatalogTypes from './catalog-types'
import { useRef, useState } from 'react'

type UseCatalogStateResult = {
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

export function useCatalogState(ready: boolean): UseCatalogStateResult {
  const [settings, setSettings] = useState<CatalogTypes.CatalogSettings | null>(null)
  const [catalog, setCatalog] = useState<CatalogTypes.CatalogView | null>(null)
  const [runs, setRuns] = useState<CatalogTypes.RunSummary[]>([])
  const [runsTotal, setRunsTotal] = useState(0)
  const [runsOffset, setRunsOffset] = useState(0)
  const [proposals, setProposals] = useState<CatalogTypes.Proposal[]>([])
  const [proposalsSplit, setProposalsSplit] = useState(false)
  const [metrics, setMetrics] = useState<CatalogTypes.Metrics | null>(null)
  const [detail, setDetail] = useState<CatalogTypes.RunDetail | null>(null)
  const [form, setForm] = useState<CatalogTypes.FormState | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [probe, setProbe] = useState<CatalogTypes.ProbeResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(ready)
  const dialogs = useCatalogDialogs()
  const hydratedRef = useRef(false)

  return {
    ...dialogs,
    settings,
    setSettings,
    catalog,
    setCatalog,
    runs,
    setRuns,
    runsTotal,
    setRunsTotal,
    runsOffset,
    setRunsOffset,
    proposals,
    setProposals,
    proposalsSplit,
    setProposalsSplit,
    metrics,
    setMetrics,
    detail,
    setDetail,
    form,
    setForm,
    formOpen,
    setFormOpen,
    probe,
    setProbe,
    error,
    setError,
    loading,
    setLoading,
    hydratedRef,
  }
}

function useCatalogDialogs() {
  const [busy, setBusy] = useState(false)
  const [runDialog, setRunDialog] = useState<{ dryRun: boolean } | null>(null)
  const [runPrompt, setRunPrompt] = useState('')
  const [adviceDialog, setAdviceDialog] = useState(false)
  const [adviceText, setAdviceText] = useState('')
  return {
    busy,
    setBusy,
    runDialog,
    setRunDialog,
    runPrompt,
    setRunPrompt,
    adviceDialog,
    setAdviceDialog,
    adviceText,
    setAdviceText,
  }
}
