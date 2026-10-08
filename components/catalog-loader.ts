'use client'

import type { useCatalogState } from './catalog-state'
import type { CatalogSettings, CatalogView, FormState, Metrics, Proposal, RunSummary } from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'
import { useCallback, useEffect, useMemo } from 'react'
import {
  catalogMetricsResponse,
  catalogProposalsResponse,
  catalogResponse,
  catalogRunsResponse,
  catalogSettingsResponse,
} from './api-schemas'
import { perform } from './async-action'
import { ACTIVE_RUN_STATES, RUNS_PAGE } from './catalog-constants'
import { formFrom } from './catalog-form'

type LoadCatalogContext = {
  ready: boolean
  api: Api
  setSettings: React.Dispatch<React.SetStateAction<CatalogSettings | null>>
  setCatalog: React.Dispatch<React.SetStateAction<CatalogView | null>>
  setRuns: React.Dispatch<React.SetStateAction<RunSummary[]>>
  setRunsTotal: React.Dispatch<React.SetStateAction<number>>
  setRunsOffset: React.Dispatch<React.SetStateAction<number>>
  setProposals: React.Dispatch<React.SetStateAction<Proposal[]>>
  setMetrics: React.Dispatch<React.SetStateAction<Metrics | null>>
  setError: React.Dispatch<React.SetStateAction<string>>
  hydratedRef: React.RefObject<boolean>
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  t: Messages
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
}

async function loadCatalog(
  context: LoadCatalogContext,
  nextRunsOffset: number,
): Promise<void> {
  const {
    ready,
    api,
    setSettings,
    setCatalog,
    setRuns,
    setRunsTotal,
    setRunsOffset,
    setProposals,
    setMetrics,
    setError,
    hydratedRef,
    setForm,
    setFormOpen,
    t,
    setLoading,
  } = context

  if (!ready) {
    return
  }
  try {
    const [nextSettings, nextCatalog, nextRuns, nextProposals, nextMetrics] = await Promise.all([
      api('catalog/settings', catalogSettingsResponse),
      api('catalog', catalogResponse),
      api(
        `catalog/runs?limit=${RUNS_PAGE}&offset=${nextRunsOffset}`,
        catalogRunsResponse,
      ),
      api('catalog/proposals', catalogProposalsResponse),
      api('catalog/metrics', catalogMetricsResponse),
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
}

function useCatalogSetters(state: ReturnType<typeof useCatalogState>) {
  const {
    setSettings,
    setCatalog,
    setRuns,
    setRunsTotal,
    setRunsOffset,
    setProposals,
    setMetrics,
    setError,
    hydratedRef,
    setForm,
    setFormOpen,
    setLoading,
  } = state
  return useMemo(() => ({
    setSettings,
    setCatalog,
    setRuns,
    setRunsTotal,
    setRunsOffset,
    setProposals,
    setMetrics,
    setError,
    hydratedRef,
    setForm,
    setFormOpen,
    setLoading,
  }), [
    setSettings,
    setCatalog,
    setRuns,
    setRunsTotal,
    setRunsOffset,
    setProposals,
    setMetrics,
    setError,
    hydratedRef,
    setForm,
    setFormOpen,
    setLoading,
  ])
}

export function useCatalogLoader(
  state: ReturnType<typeof useCatalogState>,
  api: Api,
  t: Messages,
  ready: boolean,
): (offset: number) => Promise<void> {
  const { runs, runsOffset } = state
  const setters = useCatalogSetters(state)
  const load = useCallback(
    async (offset: number) => await loadCatalog({ ...setters, api, t, ready }, offset),
    [
      setters,
      api,
      t,
      ready,
    ],
  )
  useEffect(() => {
    perform(load(0), t.loadError)
  }, [load, t.loadError])
  useCatalogPolling(
    runs.some(run => ACTIVE_RUN_STATES.has(run.status)),
    load,
    runsOffset,
    t.loadError,
  )
  return load
}

function useCatalogPolling(
  active: boolean,
  load: (offset: number) => Promise<void>,
  offset: number,
  error: string,
): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setInterval(() => {
      perform(load(offset), error)
    }, 3000)
    return () => {
      clearInterval(timer)
    }
  }, [
    active,
    load,
    offset,
    error,
  ])
}
