'use client'

export type CategoryView = {
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
  updatedAt: string
}

export type CategoryDetail = {
  category: CategoryView
  children: CategoryView[]
  memories: {
    id: string
    title: string
    kind: string
    project: string
    isPrimary: boolean
    updatedAt: string
  }[]
  total: number
  offset: number
}
