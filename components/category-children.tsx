'use client'
import type { CategoryDetail } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import { perform } from './async-action'
import { CategoryFields } from './category-fields'
import { MemoryList } from './category-memory-list'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface ChildCategoryCardProps {
  t: Messages
  detail: CategoryDetail
  busy: boolean
  openChild: (childId: string, childOffset?: number) => Promise<void>
}

export function ChildCategoryCard(
  { t, detail, busy, openChild }: ChildCategoryCardProps,
): React.JSX.Element {
  return (
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
                    onClick={() => perform(openChild(child.id), t.loadError)}
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
  )
}

interface CategoryChildDialogProps {
  childDetail: CategoryDetail | null
  setChildDetail: React.Dispatch<React.SetStateAction<CategoryDetail | null>>
  t: Messages
  busy: boolean
  openChild: (childId: string, childOffset?: number) => Promise<void>
}

export function CategoryChildDialog(
  { childDetail, setChildDetail, t, busy, openChild }: CategoryChildDialogProps,
): React.JSX.Element {
  return (
    <Dialog
      open={childDetail !== null}
      onOpenChange={(open) => {
        if (!open) {
          setChildDetail(null)
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        {childDetail !== null

          && (
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

                onPrevious={() => perform(
                  openChild(
                    childDetail.category.id,
                    Math.max(
                      0,
                      childDetail.offset - 30,
                    ),
                  ),
                  t.loadError,
                )}

                onNext={() => perform(openChild(childDetail.category.id, childDetail.offset + 30), t.loadError)}
              />
            </>
          )}
      </DialogContent>
    </Dialog>
  )
}
