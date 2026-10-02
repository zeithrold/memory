'use client'
import type { Api } from './api-client'
import type { CategoryPageContentProps } from './category-page-view'
import type { CategoryDetail } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import { useCallback, useEffect, useState } from 'react'
import { categoryDetailResponse } from './api-schemas'
import { perform } from './async-action'
import { CategoryPageContent } from './category-page-view'

import { useWorkspace } from './workspace-context'

interface CatalogCategoryPageProps { categoryId: string }

interface LoadCategoryPageContext {
  authState: ReturnType<typeof useWorkspace>['authState']
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  api: Api
  categoryId: string
  setDetail: React.Dispatch<React.SetStateAction<CategoryDetail | null>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
  setError: React.Dispatch<React.SetStateAction<string>>
  t: Messages
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
}

async function loadCategoryPage(
  context: LoadCategoryPageContext,
  nextOffset: number,
): Promise<void> {
  const { authState, setBusy, api, categoryId, setDetail, setOffset, setError, t, setLoading } = context

  if (authState !== 'ready') {
    return
  }
  setBusy(true)
  try {
    const next = await api(
      `catalog/categories/${categoryId}?offset=${nextOffset}`,
      categoryDetailResponse,
    )
    setDetail(next)
    setOffset(nextOffset)
    setError('')
  }
  catch (err) {
    setDetail(null)
    setError(err instanceof Error ? err.message : t.categoryMissing)
  }
  finally {
    setBusy(false)
    setLoading(false)
  }
}

interface OpenChildCategoryContext {
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  setChildDetail: React.Dispatch<React.SetStateAction<CategoryDetail | null>>
  api: Api
  setError: React.Dispatch<React.SetStateAction<string>>
  t: Messages
}

async function openChildCategory(
  context: OpenChildCategoryContext,
  childId: string,
  childOffset: number = 0,
): Promise<void> {
  const { setBusy, setChildDetail, api, setError, t } = context

  setBusy(true)
  try {
    setChildDetail(await api(
      `catalog/categories/${childId}?offset=${childOffset}`,
      categoryDetailResponse,
    ))
  }
  catch (err) {
    setError(err instanceof Error ? err.message : t.loadError)
  }
  finally {
    setBusy(false)
  }
}

type CatalogCategoryPageModel = Pick<
  CategoryPageContentProps,
  't'
  | 'detail'
  | 'authState'
  | 'error'
  | 'busy'
  | 'openChild'
  | 'load'
  | 'offset'
  | 'childDetail'
  | 'setChildDetail'
>
& { loading: boolean }

function useCategoryPageModel(
  { categoryId }: CatalogCategoryPageProps,
): CatalogCategoryPageModel {
  const { t, api, authState } = useWorkspace()

  const [detail, setDetail] = useState<CategoryDetail | null>(null)

  const [childDetail, setChildDetail] = useState<CategoryDetail | null>(null)

  const [error, setError] = useState('')

  const [loading, setLoading] = useState(authState === 'ready')

  const [busy, setBusy] = useState(false)

  const [offset, setOffset] = useState(0)

  const load = useCallback(
    async (nextOffset: number) => await loadCategoryPage(
      { authState, setBusy, api, categoryId, setDetail, setOffset, setError, t, setLoading },
      nextOffset,
    ),
    [
      api,
      authState,
      categoryId,
      t,
    ],
  )

  useEffect(() => {
    perform(load(0), t.loadError)
  }, [load, t.loadError])

  const openChild = async (
    childId: string,
    childOffset: number = 0,
  ) => await openChildCategory({ setBusy, setChildDetail, api, setError, t }, childId, childOffset)
  return { t, detail, authState, error, busy, openChild, load, offset, childDetail, setChildDetail, loading }
}

export default function CatalogCategoryPage(
  { categoryId }: CatalogCategoryPageProps,
): React.JSX.Element {
  const model = useCategoryPageModel({ categoryId })
  if (model.authState === 'ready' && model.loading) {
    return (
      <main className="page">
        <div className="skeleton-stack">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-line" />
        </div>
      </main>
    )
  }
  return <CategoryPageContent {...model} />
}
