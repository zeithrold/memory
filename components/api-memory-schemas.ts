import { z } from 'zod'

export const memoryResponse = z.looseObject({
  project: z.string(),
  title: z.string(),
  content: z.string(),
  kind: z.enum([
    'preference',
    'fact',
    'decision',
    'experience',
  ]),
  tags: z.array(z.string()),
  source: z.string(),
  id: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const memoryHistoryResponse = z.looseObject(
  {
    revisions: z.array(
      z.looseObject({ version: z.number(), title: z.string(), content: z.string(), kind: z.enum([
        'preference',
        'fact',
        'decision',
        'experience',
      ]), tags: z.string(), source: z.string(), created_at: z.string() }),
    ),
  },
)

export const memoryListResponse = z.looseObject({
  memories: z.array(z.looseObject({
    project: z.string(),
    title: z.string(),
    content: z.string(),
    kind: z.enum([
      'preference',
      'fact',
      'decision',
      'experience',
    ]),
    tags: z.array(z.string()),
    source: z.string(),
    id: z.string(),
    version: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
})

export const memorySearchResponse = z.looseObject({
  memories: z.array(z.looseObject({
    project: z.string(),
    title: z.string(),
    content: z.string(),
    kind: z.enum([
      'preference',
      'fact',
      'decision',
      'experience',
    ]),
    tags: z.array(z.string()),
    source: z.string(),
    id: z.string(),
    version: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  mode: z.string(),
})
