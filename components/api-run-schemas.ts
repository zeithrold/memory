import { z } from 'zod'

export const catalogRunsResponse = z.looseObject({
  runs: z.array(z.looseObject({
    id: z.string(),
    trigger: z.string(),
    mode: z.string(),
    status: z.string(),
    provider: z.union([
      z.null(),
      z.string(),
    ]),
    model: z.union([
      z.null(),
      z.string(),
    ]),
    batches: z.number(),
    turns: z.number(),
    toolCalls: z.number(),
    rejected: z.number(),
    memoriesSeen: z.number(),
    actionsApplied: z.number(),
    unorganized: z.number(),
    promptTokens: z.union([
      z.null(),
      z.number(),
    ]),
    completionTokens: z.union([
      z.null(),
      z.number(),
    ]),
    totalTokens: z.union([
      z.null(),
      z.number(),
    ]),
    usageMissingTurns: z.number(),
    tokenUsageComplete: z.boolean(),
    errorCode: z.union([
      z.null(),
      z.string(),
    ]),
    startedAt: z.string(),
    finishedAt: z.union([
      z.null(),
      z.string(),
    ]),
  })),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
})

export const catalogRunResponse = z.looseObject({
  run: z.looseObject({
    id: z.string(),
    trigger: z.string(),
    mode: z.string(),
    status: z.string(),
    provider: z.union([
      z.null(),
      z.string(),
    ]),
    model: z.union([
      z.null(),
      z.string(),
    ]),
    batches: z.number(),
    turns: z.number(),
    toolCalls: z.number(),
    rejected: z.number(),
    memoriesSeen: z.number(),
    actionsApplied: z.number(),
    unorganized: z.number(),
    promptTokens: z.union([
      z.null(),
      z.number(),
    ]),
    completionTokens: z.union([
      z.null(),
      z.number(),
    ]),
    totalTokens: z.union([
      z.null(),
      z.number(),
    ]),
    usageMissingTurns: z.number(),
    tokenUsageComplete: z.boolean(),
    errorCode: z.union([
      z.null(),
      z.string(),
    ]),
    startedAt: z.string(),
    finishedAt: z.union([
      z.null(),
      z.string(),
    ]),
  }),
  timeline: z.array(z.looseObject({
    batch: z.number(),
    turn: z.number(),
    content: z.union([
      z.null(),
      z.string(),
    ]),
    actions: z.array(z.looseObject({
      id: z.number(),
      tool: z.string(),
      kind: z.string(),
      effect: z.string(),
      decision: z.string(),
      policyReason: z.union([
        z.null(),
        z.string(),
      ]),
      rationale: z.union([
        z.null(),
        z.string(),
      ]),
      memoryId: z.union([
        z.null(),
        z.string(),
      ]),
      memoryTitle: z.union([
        z.null(),
        z.string(),
      ]),
      categoryLabel: z.union([
        z.null(),
        z.string(),
      ]),
      targetCategoryLabel: z.union([
        z.null(),
        z.string(),
      ]),
      targetProject: z.union([
        z.null(),
        z.string(),
      ]),
    })),
  })),
  totalActions: z.number(),
  offset: z.number(),
  limit: z.number(),
  operatorPrompt: z.union([
    z.null(),
    z.string(),
  ]),
})
