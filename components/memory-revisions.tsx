'use client'
import type { MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { useEffect, useRef, useState } from 'react'

import { formatDate } from './memory-format'
import { Badge } from './ui/badge'

const SOURCE_TEXT_CLASS = ['source-text whitespace-pre-wrap wrap-anywhere mt-2 mx-0 mb-0'].join(' ')

const REVISION_ITEM_CLASS = [
  'revision-item grid gap-3 p-5 bg-card border border-l-[3px] border-border rounded-md [&_h3]:m-0',
  '[&_h3]:text-body [&_h3]:wrap-anywhere',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const MEMORY_CONTENT_CLASS = [
  'memory-content whitespace-pre-wrap text-body leading-[1.85] text-muted-foreground m-0 wrap-anywhere',
].join(' ')

const PLACE_SELF_CLASS = [
  '[place-self:start_start] p-0 border-0 bg-transparent text-primary text-control font-[550] text-left',
  'hover:underline hover:underline-offset-[3px]',
].join(' ')

/**
 * One revision, clamped until asked for. Revision text can be as long as a
 * memory, so the card mirrors the list card instead of printing it all.
 */
type RevisionCardProps = {
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
    <article className={REVISION_ITEM_CLASS}>
      <div className={CARD_META_CLASS}>
        <Badge variant="secondary">{t[revision.kind]}</Badge>
        <span className="card-version tracking-[.4px]">
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
        className={[
          MEMORY_CONTENT_CLASS,
          expanded ? '' : 'memory-clamp line-clamp-4 whitespace-normal',
        ].join(' ')}
      >
        {revision.content}
      </p>
      {overflowing && (
        <button
          type="button"
          className={PLACE_SELF_CLASS}
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? t.collapse : t.expand}
        </button>
      )}
      <details>
        <summary>{t.source}</summary>
        <p className={SOURCE_TEXT_CLASS}>{revision.source}</p>
      </details>
    </article>
  )
}

type RevisionListProps = {
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
    <div className="revision-list grid gap-3">
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
