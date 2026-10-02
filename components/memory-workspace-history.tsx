'use client'
import type { MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { X } from 'lucide-react'

import { RevisionList } from './memory-revisions'
import { Button } from './ui/button'

interface WorkspaceHistoryProps {
  t: Messages
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  revisions: MemoryRevision[]
  locale: Locale
}

export function WorkspaceHistory(
  { t, setRevisions, revisions, locale }: WorkspaceHistoryProps,
): React.JSX.Element {
  return (
    <section className="detail-history">
      <div className="section-heading">
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
            <p className="muted">{t.noRevisions}</p>
          )
        : (
            <RevisionList revisions={revisions} t={t} locale={locale} />
          )}
    </section>
  )
}
