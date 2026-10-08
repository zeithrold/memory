'use client'
import type { MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { X } from 'lucide-react'

import { RevisionList } from './memory-revisions'
import { Button } from './ui/button'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const DETAIL_HISTORY_CLASS = ['detail-history mt-8 [&_>_h2]:mt-0 [&_>_h2]:mx-0 [&_>_h2]:mb-4'].join(' ')

const SECTION_HEADING_CLASS = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

type WorkspaceHistoryProps = {
  t: Messages
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  revisions: MemoryRevision[]
  locale: Locale
}

export function WorkspaceHistory(
  { t, setRevisions, revisions, locale }: WorkspaceHistoryProps,
): React.JSX.Element {
  return (
    <section className={DETAIL_HISTORY_CLASS}>
      <div className={SECTION_HEADING_CLASS}>
        <h2>{t.revisions}</h2>
        <Button
          variant="ghost"
          onClick={() => setRevisions(null)}
          aria-label={t.close}
        >
          <X size={18} />
        </Button>
      </div>
      {revisions.length === 0
        ? (
            <p className={MUTED_CLASS}>{t.noRevisions}</p>
          )
        : (
            <RevisionList revisions={revisions} t={t} locale={locale} />
          )}
    </section>
  )
}
