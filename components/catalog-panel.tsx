'use client'
import type {
  CatalogSettings,
  CatalogView,
  CategoryView,
  FormState,
  Metrics,
  ProbeResult,
  Proposal,
  RunDetail,
  RunSummary,
} from './catalog-types'
import type { Api } from './workspace-shell'
import type { Messages } from '@/lib/i18n/messages'

import { CatalogRunControls } from './catalog-controls'
import { ProposalAdviceDialog, RunStartDialog } from './catalog-dialogs'
import { catalogToggles } from './catalog-form'
import { CatalogMetricsCard } from './catalog-metrics'
import { useCatalogModel } from './catalog-model'
import { CatalogNotices, CatalogStats } from './catalog-notices'
import { CatalogProposalsCard } from './catalog-proposals'
import { CatalogRunsCard } from './catalog-runs'
import { CatalogSettingsCard } from './catalog-settings-card'
import { RunTimelineDialog } from './catalog-timeline'
import { CatalogTreeCard } from './catalog-tree'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const SKELETON_CLASS = [
  'skeleton skeleton-heading relative overflow-hidden bg-muted rounded-[6px] h-8 w-[46%]',
].join(' ')

const SKELETON_CLASS_1 = [
  'skeleton skeleton-line relative overflow-hidden bg-muted rounded-[6px] h-[11px] w-full',
].join(' ')

function CatalogPanelContent(props: CatalogPanelContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <CatalogNotices {...props} />
      <CatalogSettingsCard {...props} />

      <CatalogRunControls {...props} />
      <p className={MUTED_CLASS}>{props.t.budgetNote}</p>

      <CatalogStats {...props} />

      <CatalogTreeCard {...props} />

      <CatalogProposalsCard {...props} />

      <CatalogRunsCard {...props} />

      {props.metrics !== null && props.metrics.daily.length > 0 && (
        <CatalogMetricsCard t={props.t} metrics={props.metrics} />
      )}

      <RunStartDialog {...props} />

      <ProposalAdviceDialog {...props} />

      <RunTimelineDialog {...props} />
    </div>
  )
}

export function CatalogPanel(
  { t, api, ready }: CatalogPanelProps,
): React.JSX.Element {
  const model = useCatalogModel({ ready, api, t })
  if (ready && model.loading) {
    return (
      <div className="skeleton-stack grid gap-2">
        <div className={SKELETON_CLASS} />
        <div className={SKELETON_CLASS_1} />
      </div>
    )
  }
  const roots = (model.catalog?.categories ?? []).filter(category => category.parentId === null)
  const childrenOf = (id: string) => (model.catalog?.categories ?? []).filter(category => category.parentId === id)
  const configured = model.settings !== null && model.settings.provider !== 'none'
  const toggles = catalogToggles(model.form, t)
  return (
    <CatalogPanelContent
      {...model}
      t={t}
      api={api}
      roots={roots}
      childrenOf={childrenOf}
      configured={configured}
      toggles={toggles}
    />
  )
}

type CatalogPanelContentProps = {
  error: string
  t: Messages
  settings: CatalogSettings | null
  catalog: CatalogView | null
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  formOpen: boolean
  form: FormState | null
  patch: (next: Partial<FormState>) => void
  toggles: [string, string, boolean][]
  switchToggle: (id: string, value: boolean) => void
  busy: boolean
  save: () => Promise<void>
  test: () => Promise<void>
  probe: ProbeResult | null
  setRunDialog: React.Dispatch<React.SetStateAction<{ dryRun: boolean } | null>>
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
  roots: CategoryView[]
  childrenOf: (id: string) => CategoryView[]
  proposals: Proposal[]
  setProposalsSplit: React.Dispatch<React.SetStateAction<boolean>>
  proposalsSplit: boolean
  decideBulk: (decision: 'approve' | 'reject', advice?: string) => Promise<void>
  setAdviceDialog: React.Dispatch<React.SetStateAction<boolean>>
  run: (action: () => Promise<void>, done?: string) => Promise<void>
  api: Api
  runs: RunSummary[]
  openRunDetail: (runId: string, offset?: number) => Promise<void>
  runsTotal: number
  metrics: Metrics | null
  runDialog: { dryRun: boolean } | null
  runPrompt: string
  setRunPrompt: React.Dispatch<React.SetStateAction<string>>
  configured: boolean
  confirmStartRun: () => Promise<void>
  adviceDialog: boolean
  adviceText: string
  setAdviceText: React.Dispatch<React.SetStateAction<string>>
  detail: RunDetail | null
  setDetail: React.Dispatch<React.SetStateAction<RunDetail | null>>
}

type CatalogPanelProps = { t: Messages, api: Api, ready: boolean }
