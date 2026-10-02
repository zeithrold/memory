'use client'
import type { CategoryDetail } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface MemoryListProps {
  detail: CategoryDetail
  t: Messages
  busy: boolean
  onPrevious: () => void
  onNext: () => void
}

export function MemoryList(
  {
    detail,
    t,
    busy,
    onPrevious,
    onNext,
  }: MemoryListProps,
): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {detail.memories.length === 0
        ? <p className="muted">{t.noMemoriesInCategory}</p>
        : (
            <ul className="run-list">
              {detail.memories.map(

                memory => (
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

                ),

              )}
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
