'use client'
import type { Api } from './api-client'
import type { Memory, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ignoredResponse,
  memoryHistoryResponse,
} from './api-schemas'
import { perform } from './async-action'
import { ConfirmAction } from './confirm-action'
import { formatDate } from './memory-format'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const CARD_ACTIONS_CLASS = ['card-actions flex items-center gap-1 flex-wrap'].join(' ')

const MEMORY_CARD_TITLE_CLASS = ['memory-card-title m-0 text-body leading-[1.4] wrap-anywhere'].join(' ')

const TAGS_CLASS = ['tags flex gap-2 flex-wrap text-help text-muted-foreground m-0'].join(' ')

const SOURCE_TEXT_CLASS = ['source-text whitespace-pre-wrap wrap-anywhere mt-2 mx-0 mb-0'].join(' ')

const MEMORY_CARD_CLASS = [
  'memory-card flex flex-col gap-4 p-6 bg-card border border-border rounded-[12px]',
  'shadow-[0_2px_4px_var(--card-shadow)] wrap-anywhere',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const MEMORY_TITLE_LINK_CLASS = [
  'memory-title-link hover:text-primary hover:underline hover:underline-offset-[3px]',
].join(' ')

const MEMORY_CONTENT_CLASS = [
  'memory-content memory-clamp text-body leading-[1.85] text-muted-foreground m-0 line-clamp-3',
  '[line-clamp:4] overflow-hidden whitespace-normal wrap-anywhere',
].join(' ')

const MEMORY_CARD_FOOTER_CLASS = [
  'memory-card-footer flex items-center justify-between gap-2 mt-auto pt-3 border-t border-border',
  'text-help text-muted-foreground flex-wrap',
].join(' ')

type MemoryCardActionsProps = {
  memory: Memory
  t: Messages
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  load: () => Promise<void>
}

function MemoryCardActions(
  props: MemoryCardActionsProps,
): React.JSX.Element {
  return (
    <div className={CARD_ACTIONS_CLASS}>
      <Button asChild size="xs" variant="ghost">
        <Link href={`/memories/${props.memory.id}`}>
          {props.t.viewDetails}
        </Link>
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={props.busy}
        onClick={() => props.setEditing(props.memory)}
      >
        {props.t.edit}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={props.busy}
        onClick={() =>
          perform(props.run(async () => {
            const result = await props.api(
              `memories/${props.memory.id}/history`,
              memoryHistoryResponse,
            )
            props.setRevisions(result.revisions)
          }), props.t.loadError)}
      >
        {props.t.history}
      </Button>
      <ConfirmAction
        label={props.t.forget}
        description={props.t.forgetConfirm}
        cancel={props.t.cancel}
        disabled={props.busy}
        size="xs"
        onConfirm={() => perform(

          props.run(

            async () => {
              await props.api(

                `memories/${props.memory.id}`,

                ignoredResponse,

                { method: 'DELETE', body: JSON.stringify({ expectedVersion: props.memory.version }) },

              )
              await props.load()
              toast.success(props.t.deleted)
            },

          ),

          props.t.loadError,
        )}
      />
    </div>
  )
}

type MemoryCardProps = {
  memory: Memory
  t: Messages
  locale: Locale
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  load: () => Promise<void>
}

export function MemoryCard(props: MemoryCardProps): React.JSX.Element {
  return (
    <article
      key={props.memory.id}
      className={MEMORY_CARD_CLASS}
    >
      <div className={CARD_META_CLASS}>
        <Badge variant="secondary">{props.t[props.memory.kind]}</Badge>
        <span className="card-version tracking-[.4px]">
          v
          {props.memory.version}
        </span>
      </div>
      <h2 className={MEMORY_CARD_TITLE_CLASS}>
        <Link
          className={MEMORY_TITLE_LINK_CLASS}
          href={`/memories/${props.memory.id}`}
        >
          {props.memory.title}
        </Link>
      </h2>
      <p className={MEMORY_CONTENT_CLASS}>
        {props.memory.content}
      </p>
      {props.memory.tags.length > 0 && (
        <div className={TAGS_CLASS}>
          {props.memory.tags.map(tag => (
            <span key={tag}>
              #
              {tag}
            </span>
          ))}
        </div>
      )}
      <details>
        <summary>{props.t.source}</summary>
        <p className={SOURCE_TEXT_CLASS}>{props.memory.source}</p>
      </details>
      <footer className={MEMORY_CARD_FOOTER_CLASS}>
        <time dateTime={props.memory.updatedAt}>
          {formatDate(props.locale, props.memory.updatedAt)}
        </time>
        <MemoryCardActions
          memory={props.memory}
          t={props.t}
          busy={props.busy}
          setEditing={props.setEditing}
          run={props.run}
          api={props.api}
          setRevisions={props.setRevisions}
          load={props.load}
        />
      </footer>
    </article>
  )
}
