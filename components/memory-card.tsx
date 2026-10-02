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

interface MemoryCardActionsProps {
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
    <div className="card-actions">
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

interface MemoryCardProps {
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
    <article key={props.memory.id} className="memory-card">
      <div className="card-meta">
        <Badge variant="secondary">{props.t[props.memory.kind]}</Badge>
        <span className="card-version">
          v
          {props.memory.version}
        </span>
      </div>
      <h2 className="memory-card-title">
        <Link
          className="memory-title-link"
          href={`/memories/${props.memory.id}`}
        >
          {props.memory.title}
        </Link>
      </h2>
      <p className="memory-content memory-clamp">{props.memory.content}</p>
      {props.memory.tags.length > 0 && (
        <div className="tags">
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
        <p className="source-text">{props.memory.source}</p>
      </details>
      <footer className="memory-card-footer">
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
