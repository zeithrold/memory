import { z } from 'zod'

export const catalogSettingsResponse = z.looseObject({
  enabled: z.boolean(),
  provider: z.enum([
    'none',
    'responses-api',
    'workers-ai',
  ]),
  baseUrl: z.union([
    z.null(),
    z.string(),
  ]),
  model: z.union([
    z.null(),
    z.string(),
  ]),
  hasApiKey: z.boolean(),
  apiKeyHint: z.union([
    z.null(),
    z.string(),
  ]),
  includeContent: z.boolean(),
  intervalMinutes: z.number(),
  maxBatch: z.number(),
  maxTurns: z.number(),
  maxToolCalls: z.number(),
  dailyTokenBudget: z.number(),
  autoApplyStructural: z.boolean(),
  dryRunUntilReviewed: z.boolean(),
  awaitingReview: z.boolean(),
  failureStreak: z.number(),
  todayTokens: z.number(),
  tokenUsageComplete: z.boolean(),
  budgetExceeded: z.boolean(),
  lastProbeAt: z.union([
    z.null(),
    z.string(),
  ]),
  lastProbeOk: z.union([
    z.null(),
    z.literal(false),
    z.literal(true),
  ]),
  lastProbeError: z.union([
    z.null(),
    z.string(),
  ]),
  canStoreKey: z.boolean(),
})
