'use client'

import type { Messages } from '@/lib/i18n/messages'
import { ArrowLeft, FolderTree, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { PageHeading, SetupBanner, useWorkspace } from './workspace-shell'

interface CategoryView {
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

interface CategoryDetail {
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

function CategoryFields({ category, t }: { category: CategoryView, t: Messages }) {
  return (
    <div className="flex flex-col gap-3">
      <p>{category.description}</p>
      <p className="muted">
        <strong>{t.categoryBoundary}</strong>
        {': '}
        {category.boundary}
      </p>
      {category.axisHint !== null && category.axisHint.length > 0 && (
        <p className="muted">
          <strong>{t.categoryAxis}</strong>
          {': '}
          {category.axisHint}
        </p>
      )}
      <div className="card-meta">
        <Badge variant="secondary">{category.memberCount}</Badge>
        {category.state !== 'active' && <Badge variant="outline">{category.state}</Badge>}
      </div>
    </div>
  )
}

function MemoryList({
  detail,
  t,
  busy,
  onPrevious,
  onNext,
}: {
  detail: CategoryDetail
  t: Messages
  busy: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {detail.memories.length === 0
        ? <p className="muted">{t.noMemoriesInCategory}</p>
        : (
            <ul className="run-list">
              {detail.memories.map(memory => (
                <li key={memory.id}>
                  <div className="card-meta">
                    <Link href={`/memories/${memory.id}`} prefetch={false} className="text-button">
                      {memory.title}
                    </Link>
                    {memory.isPrimary && <Badge variant="secondary">{t.primaryBadge}</Badge>}
                    <Badge variant="outline">{memory.kind}</Badge>
                    <span className="muted">{memory.project}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
      {(detail.offset > 0 || detail.memories.length === 30) && (
        <div className="pagination">
          <Button variant="ghost" disabled={detail.offset === 0 || busy} onClick={onPrevious}>
            {t.previous}
          </Button>
          <Button
            variant="ghost"
            disabled={detail.offset + detail.memories.length >= detail.total || busy}
            onClick={onNext}
          >
            {t.next}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function CatalogCategoryPage({ categoryId }: { categoryId: string }) {
  const { t, api, authState } = useWorkspace()
  const [detail, setDetail] = useState<CategoryDetail | null>(null)
  const [childDetail, setChildDetail] = useState<CategoryDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(authState === 'ready')
  const [busy, setBusy] = useState(false)
  const [offset, setOffset] = useState(0)

  const load = useCallback(async (nextOffset: number) => {
    if (authState !== 'ready')
      return
    setBusy(true)
    try {
      const next = await api<CategoryDetail>(
        `catalog/categories/${categoryId}?offset=${nextOffset}`,
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
  }, [api, authState, categoryId, t.categoryMissing])

  useEffect(() => {
    void load(0)
  }, [load])

  async function openChild(childId: string, childOffset = 0) {
    setBusy(true)
    try {
      setChildDetail(await api<CategoryDetail>(
        `catalog/categories/${childId}?offset=${childOffset}`,
      ))
    }
    catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setBusy(false)
    }
  }

  if (authState === 'ready' && loading) {
    return (
      <main className="page">
        <div className="skeleton-stack">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-line" />
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <PageHeading
        section={t.catalog}
        title={detail?.category.label ?? t.catalog}
        intro={detail?.category.description ?? t.catalogIntro}
        action={(
          <Button variant="ghost" size="sm" asChild>
            <Link href="/catalog" prefetch={false}>
              <ArrowLeft size={16} />
              {t.backToCatalog}
            </Link>
          </Button>
        )}
      />
      {authState === 'unconfigured' && <SetupBanner />}
      {error.length > 0 && (
        <div className="error-banner" role="alert">
          <ShieldAlert size={16} />
          {' '}
          {error}
        </div>
      )}
      {detail !== null && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{detail.category.label}</CardTitle>
              <CardDescription>{detail.category.slug}</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryFields category={detail.category} t={t} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.childCategories}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.children.length === 0
                ? <p className="muted">{t.noCategories}</p>
                : (
                    <div className="catalog-card-grid">
                      {detail.children.map(child => (
                        <button
                          key={child.id}
                          type="button"
                          className="catalog-category-card"
                          disabled={busy}
                          onClick={() => void openChild(child.id)}
                        >
                          <div className="catalog-node-head">
                            <strong>{child.label}</strong>
                            <Badge variant="secondary">{child.memberCount}</Badge>
                          </div>
                          <p className="muted">{child.description}</p>
                          <p className="muted">
                            <strong>{t.categoryBoundary}</strong>
                            {': '}
                            {child.boundary}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.membersHere}</CardTitle>
              <CardDescription>{detail.total}</CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList
                detail={detail}
                t={t}
                busy={busy}
                onPrevious={() => void load(Math.max(0, offset - 30))}
                onNext={() => void load(offset + 30)}
              />
            </CardContent>
          </Card>
        </div>
      )}
      {detail === null && error.length === 0 && authState === 'ready' && (
        <div className="empty-state">
          <FolderTree size={28} />
          <h2>{t.categoryMissing}</h2>
        </div>
      )}

      <Dialog
        open={childDetail !== null}
        onOpenChange={(open) => {
          if (!open)
            setChildDetail(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          {childDetail !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{childDetail.category.label}</DialogTitle>
                <DialogDescription>{childDetail.category.slug}</DialogDescription>
              </DialogHeader>
              <CategoryFields category={childDetail.category} t={t} />
              <h3 className="text-sm font-medium">{t.membersHere}</h3>
              <MemoryList
                detail={childDetail}
                t={t}
                busy={busy}
                onPrevious={() => void openChild(childDetail.category.id, Math.max(0, childDetail.offset - 30))}
                onNext={() => void openChild(childDetail.category.id, childDetail.offset + 30)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
