'use client'
import type { CategoryDetail } from './category-types'
import type { Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const RUN_LIST_CLASS = [
  'run-list list-none p-0 m-0 grid gap-4 [&_>_li]:bg-card [&_>_li]:border [&_>_li]:border-border',
  '[&_>_li]:rounded-md [&_>_li]:p-6 [&_p]:my-2 [&_p]:mx-0 [&_p]:text-body',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const PLACE_SELF_CLASS = [
  '[place-self:start_start] p-0 border-0 bg-transparent text-primary text-control font-[550] text-left',
  'hover:underline hover:underline-offset-[3px]',
].join(' ')

type MemoryListProps = {
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
        ? <p className={MUTED_CLASS}>{t.noMemoriesInCategory}</p>
        : (
            <ul className={RUN_LIST_CLASS}>
              {detail.memories.map(

                memory => (
                  <li key={memory.id}>
                    <div className={CARD_META_CLASS}>
                      <Link
                        href={`/memories/${memory.id}`}
                        prefetch={false}
                        className={PLACE_SELF_CLASS}
                      >
                        {memory.title}
                      </Link>
                      {memory.isPrimary && <Badge variant="secondary">{t.primaryBadge}</Badge>}
                      <Badge variant="outline">{memory.kind}</Badge>
                      <span className={MUTED_CLASS_1}>{memory.project}</span>
                    </div>
                  </li>

                ),

              )}
            </ul>
          )}
      {(detail.offset > 0 || detail.memories.length === 30) && (
        <div className="pagination flex justify-end gap-3 mt-8">
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
