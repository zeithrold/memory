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
export interface CatalogSettings {
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

export interface CategoryView {
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

export interface CatalogView {
  version: number
  updatedAt: string | null
  categories: CategoryView[]
  assigned: number
  orphans: number
  skipped: number
  pendingProposals: number
  pendingAdvice: string | null
}

export interface RunSummary {
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

export interface RunDetail {
  run: RunSummary
  timeline: { batch: number, turn: number, content: string | null, actions: TimelineAction[] }[]
  totalActions: number
  offset: number
  limit: number
  operatorPrompt: string | null
}

export interface Proposal {
  id: string
  kind: string
  status: string
  evidenceRuns: number
  lastRunId: string
  rationale: string | null
  targetProject: string | null
}

export interface Metrics {
  totals: Record<string, number>
  daily: {
    day: string
    runs: number
    applied: number
    rejected: number
    reassignments: number
    orphan_count: number
    prompt_tokens: number
    completion_tokens: number
    usage_missing_turns: number
  }[]
}

export interface ProbeResult {
  reachable: boolean
  modelOk: boolean
  toolCallingOk: boolean
  detail: string
}

export interface FormState {
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
