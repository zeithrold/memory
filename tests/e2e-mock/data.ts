import type { CatalogSettings, RunSummary } from '../../components/catalog-types'
import type { Memory } from '../../lib/contracts'

export const timestamp = '2026-10-01T12:00:00.000Z'
export function initialMemory(): Memory {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Original decision',
    content: 'Keep this context.',
    kind: 'decision',
    project: 'global',
    tags: ['design'],
    source: 'https://example.com/context',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
export function initialSettings(): CatalogSettings {
  return {
    enabled: false,
    provider: 'workers-ai',
    baseUrl: null,
    model: '@cf/example/model',
    hasApiKey: false,
    apiKeyHint: null,
    includeContent: false,
    intervalMinutes: 120,
    maxBatch: 10,
    maxTurns: 4,
    maxToolCalls: 6,
    dailyTokenBudget: 100000,
    autoApplyStructural: false,
    dryRunUntilReviewed: false,
    awaitingReview: false,
    failureStreak: 0,
    todayTokens: 0,
    tokenUsageComplete: true,
    budgetExceeded: false,
    lastProbeAt: null,
    lastProbeOk: null,
    lastProbeError: null,
    canStoreKey: false,
  }
}
export function initialRun(): RunSummary {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    trigger: 'manual',
    mode: 'live',
    status: 'running',
    provider: 'workers-ai',
    model: '@cf/example/model',
    batches: 1,
    turns: 1,
    toolCalls: 1,
    rejected: 0,
    memoriesSeen: 1,
    actionsApplied: 0,
    unorganized: 0,
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20,
    usageMissingTurns: 0,
    tokenUsageComplete: true,
    errorCode: null,
    startedAt: timestamp,
    finishedAt: null,
  }
}
