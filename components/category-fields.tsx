'use client'
import type { CategoryView } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import { Badge } from './ui/badge'

interface CategoryFieldsProps { category: CategoryView, t: Messages }

export function CategoryFields({ category, t }: CategoryFieldsProps): React.JSX.Element {
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
