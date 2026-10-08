'use client'
import type { CategoryView } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { FolderTree } from 'lucide-react'
import Link from 'next/link'

import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_3 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_4 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const EMPTY_STATE_CLASS = [
  'empty-state min-h-[330px] flex flex-col items-center justify-center text-center py-10 px-4 [&_h2]:mt-1',
  '[&_h2]:mx-0 [&_h2]:mb-2 [&_h2]:text-[length:19px] [&_p]:text-muted-foreground [&_p]:text-body',
  '[&_p]:leading-[1.9] [&_p]:max-w-[350px] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-6 max-[640px]:min-h-70',
].join(' ')

const CATALOG_CARD_GRID_CLASS = [
  'catalog-card-grid grid gap-4 grid-cols-[repeat(auto-fill,_minmax(240px,_1fr))]',
].join(' ')

const CATALOG_CATEGORY_CARD_CLASS = [
  'catalog-category-card flex flex-col gap-2 text-left bg-card border border-border rounded-md p-6',
  'cursor-pointer text-inherit [font:inherit] [transition:border-color_120ms_ease,_box-shadow_120ms_ease]',
  'hover:border-foreground hover:shadow-[0_8px_24px_var(--hover-shadow)] disabled:opacity-[0.6]',
  'disabled:cursor-not-allowed [&_p]:m-0 [&_p]:text-body [&_p]:line-clamp-3 [&_p]:overflow-hidden',
].join(' ')

export function CatalogTreeCard(
  { t, roots, childrenOf }: CatalogTreeCardProps,
): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.categories}</CardTitle>
      </CardHeader>
      <CardContent>
        {roots.length === 0

          ? (
              <div className={EMPTY_STATE_CLASS}>
                <FolderTree size={28} />
                <h2>{t.noCategories}</h2>
                <p className={MUTED_CLASS}>{t.notConfigured}</p>
              </div>
            )

          : (
              <div className={CATALOG_CARD_GRID_CLASS}>
                {roots.map(

                  root => (
                    <Link
                      key={root.id}
                      href={`/catalog/${root.id}`}
                      prefetch={false}
                      className={CATALOG_CATEGORY_CARD_CLASS}
                    >
                      <div className="catalog-node-head flex items-center gap-3">
                        <strong>{root.label}</strong>
                        <Badge variant="secondary">{root.memberCount}</Badge>
                        {root.state !== 'active' && <Badge variant="outline">{root.state}</Badge>}
                      </div>
                      <p className={MUTED_CLASS_1}>{root.description}</p>
                      <p className={MUTED_CLASS_2}>
                        <strong>{t.categoryBoundary}</strong>
                        {': '}
                        {root.boundary}
                      </p>
                      {root.axisHint !== null && root.axisHint.length > 0 && (
                        <p className={MUTED_CLASS_3}>
                          <strong>{t.categoryAxis}</strong>
                          {': '}
                          {root.axisHint}
                        </p>

                      )}
                      <p className={MUTED_CLASS_4}>
                        {t.childCategories}
                        {': '}
                        {childrenOf(root.id).length}
                      </p>
                    </Link>
                  ),

                )}
              </div>
            )}
      </CardContent>
    </Card>
  )
}

type CatalogTreeCardProps = {
  t: Messages
  roots: CategoryView[]
  childrenOf: (id: string) => CategoryView[]
}
