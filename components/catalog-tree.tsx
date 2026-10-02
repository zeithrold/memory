'use client'
import type { CategoryView } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { FolderTree } from 'lucide-react'
import Link from 'next/link'

import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

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
              <div className="empty-state">
                <FolderTree size={28} />
                <h2>{t.noCategories}</h2>
                <p className="muted">{t.notConfigured}</p>
              </div>
            )

          : (
              <div className="catalog-card-grid">
                {roots.map(

                  root => (
                    <Link
                      key={root.id}
                      href={`/catalog/${root.id}`}
                      prefetch={false}
                      className="catalog-category-card"
                    >
                      <div className="catalog-node-head">
                        <strong>{root.label}</strong>
                        <Badge variant="secondary">{root.memberCount}</Badge>
                        {root.state !== 'active' && <Badge variant="outline">{root.state}</Badge>}
                      </div>
                      <p className="muted">{root.description}</p>
                      <p className="muted">
                        <strong>{t.categoryBoundary}</strong>
                        {': '}
                        {root.boundary}
                      </p>
                      {root.axisHint !== null && root.axisHint.length > 0 && (
                        <p className="muted">
                          <strong>{t.categoryAxis}</strong>
                          {': '}
                          {root.axisHint}
                        </p>

                      )}
                      <p className="muted">
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

interface CatalogTreeCardProps {
  t: Messages
  roots: CategoryView[]
  childrenOf: (id: string) => CategoryView[]
}
