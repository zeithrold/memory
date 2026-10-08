'use client'
import type { useRouter } from 'next/navigation'
import type { Api } from './api-client'
import type { Memory, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ignoredResponse,
} from './api-schemas'
import { perform } from './async-action'
import { MemoryDetailArticle, MemoryToolbar } from './memory-detail-parts'
import { MemoryEditor } from './memory-editor'
import { RevisionList } from './memory-revisions'
import { MemoryDetailSkeleton, RevisionListSkeleton } from './skeletons'
import { Button } from './ui/button'
import { SetupBanner } from './workspace-shell'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const DETAIL_HISTORY_CLASS = ['detail-history mt-8 [&_>_h2]:mt-0 [&_>_h2]:mx-0 [&_>_h2]:mb-4'].join(' ')

const SECTION_HEADING_CLASS = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

const PAGE_CLASS = [
  'page detail-page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6',
  'max-[640px]:py-6 max-[640px]:px-4',
].join(' ')

const ERROR_BANNER_CLASS = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

const EMPTY_STATE_CLASS = [
  'empty-state min-h-[330px] flex flex-col items-center justify-center text-center py-10 px-4 [&_h2]:mt-1',
  '[&_h2]:mx-0 [&_h2]:mb-2 [&_h2]:text-[length:19px] [&_p]:text-muted-foreground [&_p]:text-body',
  '[&_p]:leading-[1.9] [&_p]:max-w-[350px] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-6 max-[640px]:min-h-70',
].join(' ')

const EMPTY_ICON_CLASS = [
  'empty-icon h-19 w-19 border border-border rounded-[25px] bg-muted grid [place-items:center]',
  'text-muted-foreground transform-[rotate(-6deg)] mb-5',
].join(' ')

type MemoryHistoryProps = {
  t: Messages
  revisions: MemoryRevision[] | null
  historyBusy: boolean
  loadHistory: () => Promise<void>
  locale: Locale
}

function MemoryHistory(
  { t, revisions, historyBusy, loadHistory, locale }: MemoryHistoryProps,
): React.JSX.Element {
  return (
    <section className={DETAIL_HISTORY_CLASS}>
      <div className={SECTION_HEADING_CLASS}>
        <h2>{t.revisions}</h2>
        {revisions === null && (
          <Button
            variant="outline"
            size="sm"
            disabled={historyBusy}
            onClick={() => perform(loadHistory(), t.loadError)}
          >
            {historyBusy ? t.working : t.loadRevisions}
          </Button>
        )}
      </div>
      {revisions === null && historyBusy && <RevisionListSkeleton />}
      {revisions !== null
        && (revisions.length === 0
          ? (
              <p className={MUTED_CLASS}>{t.noRevisions}</p>
            )
          : (
              <RevisionList revisions={revisions} t={t} locale={locale} />
            ))}
    </section>
  )
}

type MemoryDetailEditorProps = {
  memory: Memory
  t: Messages
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<boolean>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  load: () => Promise<void>
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
}

function MemoryDetailEditor(props: MemoryDetailEditorProps): React.JSX.Element {
  return (
    <MemoryEditor
      key={`${props.memory.id}:${props.memory.version}`}
      t={props.t}
      memory={props.memory}
      project={props.memory.project}
      busy={props.busy}
      onCancel={() => props.setEditing(false)}
      onSave={input =>
        perform(props.run(async () => {
          await props.api(`memories/${props.memory.id}`, ignoredResponse, {
            method: 'PATCH',
            body: JSON.stringify({
              ...input,
              expectedVersion: props.memory.version,
            }),
          })
          props.setEditing(false)
          await props.load()
          // The saved version joins the history, so it must be refetched.
          props.setRevisions(null)
          toast.success(props.t.saved)
        }), props.t.loadError)}
    />
  )
}

export type MemoryDetailContentProps = {
  t: Messages
  memory: Memory | null
  editing: boolean
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<boolean>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  router: ReturnType<typeof useRouter> & { bfcacheId: string }
  authState: 'ready' | 'unconfigured'
  error: string
  loading: boolean
  missing: boolean
  load: () => Promise<void>
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  locale: Locale
  revisions: MemoryRevision[] | null
  historyBusy: boolean
  loadHistory: () => Promise<void>
}

export function MemoryDetailContent(
  props: MemoryDetailContentProps,
): React.JSX.Element {
  return (
    <div className={PAGE_CLASS}>
      <MemoryToolbar
        t={props.t}
        memory={props.memory}
        editing={props.editing}
        busy={props.busy}
        setEditing={props.setEditing}
        run={props.run}
        api={props.api}
        router={props.router}
      />
      {props.authState === 'unconfigured' && <SetupBanner />}
      {(props.error.length > 0) && (
        <div
          className={ERROR_BANNER_CLASS}
          role="alert"
        >
          {props.error}
        </div>
      )}
      <MemoryDetailStatus loading={props.loading} memory={props.memory} missing={props.missing} t={props.t} />
      {props.memory !== null && props.editing && (
        <MemoryDetailEditor
          memory={props.memory}
          t={props.t}
          busy={props.busy}
          setEditing={props.setEditing}
          run={props.run}
          api={props.api}
          load={props.load}
          setRevisions={props.setRevisions}
        />
      )}
      {props.memory !== null && !props.editing && (
        <>
          <MemoryDetailArticle t={props.t} memory={props.memory} locale={props.locale} />
          <MemoryHistory
            t={props.t}
            revisions={props.revisions}
            historyBusy={props.historyBusy}
            loadHistory={props.loadHistory}
            locale={props.locale}
          />
        </>
      )}
    </div>
  )
}

function MemoryDetailStatus(
  props: Pick<MemoryDetailContentProps, 'loading' | 'memory' | 'missing' | 't'>,
): React.JSX.Element {
  return (
    <>
      {props.loading && props.memory === null && !props.missing && <MemoryDetailSkeleton />}
      {props.missing && (
        <div className={EMPTY_STATE_CLASS}>
          <div className={EMPTY_ICON_CLASS}>
            <BookOpen size={34} strokeWidth={1.3} />
          </div>
          <h2>{props.t.missingMemory}</h2>
          <Button asChild variant="outline">
            <Link href="/memories">{props.t.back}</Link>
          </Button>
        </div>
      )}

    </>
  )
}
