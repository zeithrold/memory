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

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const CATALOG_CARD_GRID_CLASS = [
  'catalog-card-grid grid gap-4 grid-cols-[repeat(auto-fill,_minmax(240px,_1fr))]',
].join(' ')

const CATALOG_CATEGORY_CARD_CLASS = [
  'catalog-category-card flex flex-col gap-2 text-left bg-card border border-border rounded-md p-6',
  'cursor-pointer text-inherit [font:inherit] [transition:border-color_120ms_ease,_box-shadow_120ms_ease]',
  'hover:border-foreground hover:shadow-[0_8px_24px_var(--hover-shadow)] disabled:opacity-[0.6]',
  'disabled:cursor-not-allowed [&_p]:m-0 [&_p]:text-body [&_p]:line-clamp-3 [&_p]:overflow-hidden',
].join(' ')

type ChildCategoryCardProps = {
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
          ? <p className={MUTED_CLASS}>{t.noCategories}</p>
          : (
              <div className={CATALOG_CARD_GRID_CLASS}>
                {detail.children.map(child => (
                  <button
                    key={child.id}
                    type="button"
                    className={CATALOG_CATEGORY_CARD_CLASS}
                    disabled={busy}
                    onClick={() => perform(openChild(child.id), t.loadError)}
                  >
                    <div className="catalog-node-head flex items-center gap-3">
                      <strong>{child.label}</strong>
                      <Badge variant="secondary">{child.memberCount}</Badge>
                    </div>
                    <p className={MUTED_CLASS_1}>{child.description}</p>
                    <p className={MUTED_CLASS_2}>
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

type CategoryChildDialogProps = {
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
      <DialogContent closeLabel={t.close} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
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
