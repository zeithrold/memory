import { z } from 'zod'

export const categoryDetailResponse = z.looseObject({
  category: z.looseObject({
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
    updatedAt: z.string(),
  }),
  children: z.array(z.looseObject({
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
    updatedAt: z.string(),
  })),
  memories: z.array(z.looseObject({
    id: z.string(),
    title: z.string(),
    kind: z.string(),
    project: z.string(),
    isPrimary: z.boolean(),
    updatedAt: z.string(),
  })),
  total: z.number(),
  offset: z.number(),
})
