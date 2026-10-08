'use client'
import type { CategoryView } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import { Badge } from './ui/badge'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

type CategoryFieldsProps = { category: CategoryView, t: Messages }

export function CategoryFields({ category, t }: CategoryFieldsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p>{category.description}</p>
      <p className={MUTED_CLASS}>
        <strong>{t.categoryBoundary}</strong>
        {': '}
        {category.boundary}
      </p>
      {category.axisHint !== null && category.axisHint.length > 0 && (
        <p className={MUTED_CLASS_1}>
          <strong>{t.categoryAxis}</strong>
          {': '}
          {category.axisHint}
        </p>
      )}
      <div className={CARD_META_CLASS}>
        <Badge variant="secondary">{category.memberCount}</Badge>
        {category.state !== 'active' && <Badge variant="outline">{category.state}</Badge>}
      </div>
    </div>
  )
}
