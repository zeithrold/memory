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

export interface RunRow {
  id: string
  trigger: string
  mode: string
  status: string
  provider: string | null
  model: string | null
  batches: number
  turns: number
  tool_calls: number
  rejected: number
  memories_seen: number
  actions_applied: number
  unorganized: number
  prompt_tokens: number | null
  completion_tokens: number | null
  usage_missing_turns: number
  error_code: string | null
  started_at: string
  finished_at: string | null
}

export interface TimelineEntry {
  batch: number
  turn: number
  content: string | null
  promptTokens: number | null
  completionTokens: number | null
  latencyMs: number | null
  actions: {
    id: number
    tool: string
    kind: string
    effect: string
    decision: string
    policyReason: string | null
    rationale: string | null
    memoryId: string | null
    memoryTitle: string | null
    categoryId: string | null
    categoryLabel: string | null
    targetCategoryId: string | null
    targetCategoryLabel: string | null
    targetProject: string | null
  }[]
}

export interface RunDetail {
  run: RunSummary
  timeline: TimelineEntry[]
  totalActions: number
  offset: number
  limit: number
  operatorPrompt: string | null
}

export interface ActionRow {

  id: number
  batch: number
  turn: number
  tool: string
  kind: string
  effect: string
  decision: string
  policy_reason: string | null
  rationale: string | null
  memory_id: string | null
  memory_title: string | null
  category_id: string | null
  category_label: string | null
  target_category_id: string | null
  target_category_label: string | null
  target_project: string | null

}

export interface TurnMeta {
  batch: number
  turn: number
  content: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
}
