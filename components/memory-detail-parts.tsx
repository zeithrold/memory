'use client'
import type { useRouter } from 'next/navigation'
import type { Api } from './api-client'
import type { Memory } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ignoredResponse,
} from './api-schemas'
import { perform } from './async-action'
import { ConfirmAction } from './confirm-action'
import { formatDate } from './memory-format'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface MemoryToolbarProps {
  t: Messages
  memory: Memory | null
  editing: boolean
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<boolean>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  router: ReturnType<typeof useRouter> & { bfcacheId: string }
}

export function MemoryToolbar(props: MemoryToolbarProps): React.JSX.Element {
  const { memory } = props
  return (
    <div className="detail-toolbar">
      <Link className="back-link" href="/memories">
        <ArrowLeft size={16} />
        {props.t.back}
      </Link>
      {memory !== null && !props.editing && (
        <div className="detail-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={props.busy}
            onClick={() => props.setEditing(true)}
          >
            {props.t.edit}
          </Button>
          <ConfirmAction
            label={props.t.forget}
            description={props.t.forgetConfirm}
            cancel={props.t.cancel}
            disabled={props.busy}
            onConfirm={() => perform(props.run(async () => {
              await props.api(`memories/${memory.id}`, ignoredResponse, {
                method: 'DELETE',
                body: JSON.stringify({ expectedVersion: memory.version }),
              })
              toast.success(props.t.deleted)
              props.router.push('/memories')
            }), props.t.loadError)}
          />
        </div>
      )}
    </div>
  )
}

interface MemoryMetadataProps {
  t: Messages
  memory: Memory
  locale: Locale
}

function MemoryMetadata({ t, memory, locale }: MemoryMetadataProps): React.JSX.Element {
  return (
    <dl className="detail-meta">
      <div>
        <dt>{t.created}</dt>
        <dd>
          <time dateTime={memory.createdAt}>
            {formatDate(locale, memory.createdAt, true)}
          </time>
        </dd>
      </div>
      <div>
        <dt>{t.updated}</dt>
        <dd>
          <time dateTime={memory.updatedAt}>
            {formatDate(locale, memory.updatedAt, true)}
          </time>
        </dd>
      </div>
      <div>
        <dt>{t.version}</dt>
        <dd>
          v
          {memory.version}
        </dd>
      </div>
    </dl>
  )
}

interface MemoryDetailArticleProps {
  t: Messages
  memory: Memory
  locale: Locale
}

export function MemoryDetailArticle(
  { t, memory, locale }: MemoryDetailArticleProps,
): React.JSX.Element {
  return (
    <article className="detail-card">
      <div className="card-meta">
        <Badge variant="secondary">{t[memory.kind]}</Badge>
        <Badge variant="outline">{memory.project}</Badge>
      </div>
      <h1 className="detail-title">{memory.title}</h1>
      <MemoryMetadata t={t} memory={memory} locale={locale} />
      <p className="detail-content">{memory.content}</p>
      {memory.tags.length > 0 && (
        <div className="detail-tags">
          <span className="detail-label">{t.tagList}</span>
          <div className="tags">
            {memory.tags.map(tag => (
              <span key={tag}>
                #
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <section className="detail-source">
        <h2>{t.source}</h2>
        <p className="source-text">{memory.source}</p>
      </section>
    </article>
  )
}
