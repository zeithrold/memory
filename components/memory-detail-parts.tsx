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

const DETAIL_TAGS_CLASS = ['detail-tags flex items-baseline gap-3 flex-wrap'].join(' ')

const DETAIL_TOOLBAR_CLASS = ['detail-toolbar flex items-center justify-between gap-4 flex-wrap mb-6'].join(' ')

const DETAIL_CARD_CLASS = ['detail-card grid gap-5 p-6 bg-card border border-border rounded-[12px]'].join(' ')

const TAGS_CLASS = ['tags flex gap-2 flex-wrap text-help text-muted-foreground m-0'].join(' ')

const SOURCE_TEXT_CLASS = ['source-text whitespace-pre-wrap wrap-anywhere mt-2 mx-0 mb-0'].join(' ')

const BACK_LINK_CLASS = [
  'back-link inline-flex items-center gap-2 text-muted-foreground text-control hover:text-primary',
].join(' ')

const DETAIL_META_CLASS = [
  'detail-meta flex flex-wrap gap-y-3 gap-x-6 m-0 [&_div]:grid [&_div]:gap-1 [&_dt]:text-help',
  '[&_dt]:tracking-[1.4px] [&_dt]:uppercase [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:text-control',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const DETAIL_TITLE_CLASS = [
  'detail-title m-0 text-[length:clamp(22px,_2.6vw,_30px)] font-medium tracking-[-.9px] leading-[1.3]',
  'wrap-anywhere',
].join(' ')

const DETAIL_CONTENT_CLASS = [
  'detail-content m-0 max-w-[76ch] whitespace-pre-wrap text-body leading-[1.9] text-foreground',
  'wrap-anywhere',
].join(' ')

const DETAIL_LABEL_CLASS = ['detail-label text-help tracking-[1.4px] uppercase text-muted-foreground'].join(' ')

const DETAIL_SOURCE_CLASS = [
  'detail-source border-t border-border pt-4 grid gap-2 [&_h2]:m-0 [&_h2]:text-help [&_h2]:font-semibold',
  '[&_h2]:tracking-[1.4px] [&_h2]:uppercase [&_h2]:text-muted-foreground',
].join(' ')

type MemoryToolbarProps = {
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
    <div className={DETAIL_TOOLBAR_CLASS}>
      <Link
        className={BACK_LINK_CLASS}
        href="/memories"
      >
        <ArrowLeft size={16} />
        {props.t.back}
      </Link>
      {memory !== null && !props.editing && (
        <div className="detail-actions flex items-center gap-2">
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

type MemoryMetadataProps = {
  t: Messages
  memory: Memory
  locale: Locale
}

function MemoryMetadata({ t, memory, locale }: MemoryMetadataProps): React.JSX.Element {
  return (
    <dl className={DETAIL_META_CLASS}>
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

type MemoryDetailArticleProps = {
  t: Messages
  memory: Memory
  locale: Locale
}

export function MemoryDetailArticle(
  { t, memory, locale }: MemoryDetailArticleProps,
): React.JSX.Element {
  return (
    <article className={DETAIL_CARD_CLASS}>
      <div className={CARD_META_CLASS}>
        <Badge variant="secondary">{t[memory.kind]}</Badge>
        <Badge variant="outline">{memory.project}</Badge>
      </div>
      <h1 className={DETAIL_TITLE_CLASS}>
        {memory.title}
      </h1>
      <MemoryMetadata t={t} memory={memory} locale={locale} />
      <p className={DETAIL_CONTENT_CLASS}>
        {memory.content}
      </p>
      {memory.tags.length > 0 && (
        <div className={DETAIL_TAGS_CLASS}>
          <span className={DETAIL_LABEL_CLASS}>{t.tagList}</span>
          <div className={TAGS_CLASS}>
            {memory.tags.map(tag => (
              <span key={tag}>
                #
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <section className={DETAIL_SOURCE_CLASS}>
        <h2>{t.source}</h2>
        <p className={SOURCE_TEXT_CLASS}>{memory.source}</p>
      </section>
    </article>
  )
}
