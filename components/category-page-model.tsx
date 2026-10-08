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

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

const SKELETON_CLASS = [
  'skeleton skeleton-heading relative overflow-hidden bg-muted rounded-[6px] h-8 w-[46%]',
].join(' ')

const SKELETON_CLASS_1 = [
  'skeleton skeleton-line relative overflow-hidden bg-muted rounded-[6px] h-[11px] w-full',
].join(' ')

type CatalogCategoryPageProps = { categoryId: string }

type LoadCategoryPageContext = {
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

type OpenChildCategoryContext = {
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
      <div className={PAGE_CLASS}>
        <div className="skeleton-stack grid gap-2">
          <div className={SKELETON_CLASS} />
          <div className={SKELETON_CLASS_1} />
        </div>
      </div>
    )
  }
  return <CategoryPageContent {...model} />
}
