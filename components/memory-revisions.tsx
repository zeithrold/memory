'use client'
import type { MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { useEffect, useRef, useState } from 'react'

import { formatDate } from './memory-format'
import { Badge } from './ui/badge'

/**
 * One revision, clamped until asked for. Revision text can be as long as a
 * memory, so the card mirrors the list card instead of printing it all.
 */
interface RevisionCardProps {
  revision: MemoryRevision
  t: Messages
  locale: Locale
}

function RevisionCard({
  revision,
  t,
  locale,
}: RevisionCardProps) {
  const [expanded, setExpanded] = useState(false)
  // Measured after layout: a short revision must not offer an expander that
  // reveals nothing. The last measurement is kept while expanded so "Show less"
  // stays available.
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (expanded) {
      return
    }
    const node = contentRef.current
    if (node !== null) {
      setOverflowing(node.scrollHeight > node.clientHeight + 1)
    }
  }, [expanded, revision.content])
  return (
    <article className="revision-item">
      <div className="card-meta">
        <Badge variant="secondary">{t[revision.kind]}</Badge>
        <span className="card-version">
          v
          {revision.version}
        </span>
        <time dateTime={revision.created_at}>
          {formatDate(locale, revision.created_at, true)}
        </time>
      </div>
      <h3>{revision.title}</h3>
      <p
        ref={contentRef}
        className={`memory-content${expanded ? '' : ' memory-clamp'}`}
      >
        {revision.content}
      </p>
      {overflowing && (
        <button
          type="button"
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? t.collapse : t.expand}
        </button>
      )}
      <details>
        <summary>{t.source}</summary>
        <p className="source-text">{revision.source}</p>
      </details>
    </article>
  )
}

interface RevisionListProps {
  revisions: MemoryRevision[]
  t: Messages
  locale: Locale
}

export function RevisionList({
  revisions,
  t,
  locale,
}: RevisionListProps): React.JSX.Element {
  return (
    <div className="revision-list">
      {revisions.map(revision => (
        <RevisionCard
          key={revision.version}
          revision={revision}
          t={t}
          locale={locale}
        />
      ))}
    </div>
  )
}
