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

interface MemoryHistoryProps {
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
    <section className="detail-history">
      <div className="section-heading">
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
              <p className="muted">{t.noRevisions}</p>
            )
          : (
              <RevisionList revisions={revisions} t={t} locale={locale} />
            ))}
    </section>
  )
}

interface MemoryDetailEditorProps {
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

export interface MemoryDetailContentProps {
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
    <div className="page detail-page">
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
        <div className="error-banner" role="alert">
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
        <div className="empty-state">
          <div className="empty-icon">
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
