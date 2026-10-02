import { z } from 'zod'

export const catalogResponse = z.looseObject({
  version: z.number(),
  updatedAt: z.union([
    z.null(),
    z.string(),
  ]),
  categories: z.array(z.looseObject({
    id: z.string(),
    parentId: z.union([
      z.null(),
      z.string(),
    ]),
    depth: z.number(),
    slug: z.string(),
    label: z.string(),
    description: z.string(),
    boundary: z.string(),
    axisHint: z.union([
      z.null(),
      z.string(),
    ]),
    memberCount: z.number(),
    state: z.string(),
    createdBy: z.string(),
  })),
  assigned: z.number(),
  orphans: z.number(),
  skipped: z.number(),
  pendingProposals: z.number(),
  pendingAdvice: z.union([
    z.null(),
    z.string(),
  ]),
})

export const catalogProposalsResponse = z.looseObject({
  proposals: z.array(z.looseObject({
    id: z.string(),
    kind: z.string(),
    status: z.string(),
    evidenceRuns: z.number(),
    lastRunId: z.string(),
    rationale: z.union([
      z.null(),
      z.string(),
    ]),
    targetProject: z.union([
      z.null(),
      z.string(),
    ]),
  })),
})

export const catalogMetricsResponse = z.looseObject({
  totals: z.record(z.string(), z.number()),
  daily: z.array(z.looseObject({
    day: z.string(),
    runs: z.number(),
    applied: z.number(),
    rejected: z.number(),
    reassignments: z.number(),
    orphan_count: z.number(),
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    usage_missing_turns: z.number(),
  })),
})

export const catalogProbeResponse = z.looseObject({
  reachable: z.boolean(),
  modelOk: z.boolean(),
  toolCallingOk: z.boolean(),
  detail: z.string(),
})

export const catalogBudgetResponse = z.looseObject({ budgetWarning: z.boolean() })
