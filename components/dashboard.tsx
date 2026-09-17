'use client'

import type { Memory, MemoryInput, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { ArrowLeft, ArrowUpRight, BookOpen, Plus, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { MemoryDetailSkeleton, MemoryGridSkeleton, RevisionListSkeleton } from './skeletons'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { ProblemError, SetupBanner, useWorkspace } from './workspace-shell'

function formatDate(locale: Locale, value: string, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  return new Intl.DateTimeFormat(locale, options).format(new Date(value))
}
/**
 * `/memories/[id]` renders the detail page; every other view keeps the tabbed
 * workspace, so a nav click always returns to the list route's own content.
 */
export function MemoriesPage({ memoryId }: { memoryId?: string }) {
  const { t, locale, authState, api } = useWorkspace()
  if (memoryId !== undefined && memoryId.length > 0)
    return <MemoryDetail t={t} locale={locale} memoryId={memoryId} authState={authState} api={api} />
  return <Workspace t={t} locale={locale} authState={authState} api={api} />
}
/**
 * One revision, clamped until asked for. Revision text can be as long as a
 * memory, so the card mirrors the list card instead of printing it all.
 */
function RevisionCard({
  revision,
  t,
  locale,
}: {
  revision: MemoryRevision
  t: Messages
  locale: Locale
}) {
  const [expanded, setExpanded] = useState(false)
  // Measured after layout: a short revision must not offer an expander that
  // reveals nothing. The last measurement is kept while expanded so "Show less"
  // stays available.
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (expanded)
      return
    const node = contentRef.current
    if (node !== null)
      setOverflowing(node.scrollHeight > node.clientHeight + 1)
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
function RevisionList({
  revisions,
  t,
  locale,
}: {
  revisions: MemoryRevision[]
  t: Messages
  locale: Locale
}) {
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
function MemoryDetail({
  t,
  locale,
  memoryId,
  authState,
  api,
}: {
  t: Messages
  locale: Locale
  memoryId: string
  authState: 'ready' | 'unconfigured'
  api: ReturnType<typeof useWorkspace>['api']
}) {
  const router = useRouter()
  const [memory, setMemory] = useState<Memory | null>(null)
  // `null` means the history was never requested; it loads on demand because a
  // memory can carry up to 50 revisions and most visits never open them.
  const [revisions, setRevisions] = useState<MemoryRevision[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(authState === 'ready')
  const [historyBusy, setHistoryBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (authState !== 'ready')
      return
    setLoading(true)
    setError('')
    setMissing(false)
    try {
      setMemory(await api<Memory>(`memories/${memoryId}`))
    }
    catch (err) {
      setMemory(null)
      if (err instanceof ProblemError && err.code === 'NOT_FOUND')
        setMissing(true)
      else
        setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setLoading(false)
    }
  }, [api, authState, memoryId, t.loadError])
  useEffect(() => {
    void load()
  }, [load])
  const loadHistory = useCallback(async () => {
    setHistoryBusy(true)
    try {
      const result = await api<{ revisions: MemoryRevision[] }>(
        `memories/${memoryId}/history`,
      )
      setRevisions(result.revisions)
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setHistoryBusy(false)
    }
  }, [api, memoryId, t.loadError])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <main className="page detail-page">
      <div className="detail-toolbar">
        <Link className="back-link" href="/memories">
          <ArrowLeft size={16} />
          {t.back}
        </Link>
        {memory !== null && !editing && (
          <div className="detail-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              {t.edit}
            </Button>
            <ConfirmAction
              label={t.forget}
              description={t.forgetConfirm}
              cancel={t.cancel}
              disabled={busy}
              onConfirm={() => void run(async () => {
                await api(`memories/${memory.id}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ expectedVersion: memory.version }),
                })
                toast.success(t.deleted)
                router.push('/memories')
              })}
            />
          </div>
        )}
      </div>
      {authState === 'unconfigured' && <SetupBanner />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading && memory === null && !missing && <MemoryDetailSkeleton />}
      {missing && (
        <div className="empty-state">
          <div className="empty-icon">
            <BookOpen size={34} strokeWidth={1.3} />
          </div>
          <h2>{t.missingMemory}</h2>
          <Button asChild variant="outline">
            <Link href="/memories">{t.back}</Link>
          </Button>
        </div>
      )}
      {memory !== null && editing && (
        <MemoryEditor
          key={`${memory.id}:${memory.version}`}
          t={t}
          memory={memory}
          project={memory.project}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={input =>
            void run(async () => {
              await api(`memories/${memory.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  ...input,
                  expectedVersion: memory.version,
                }),
              })
              setEditing(false)
              await load()
              // The saved version joins the history, so it must be refetched.
              setRevisions(null)
              toast.success(t.saved)
            })}
        />
      )}
      {memory !== null && !editing && (
        <>
          <article className="detail-card">
            <div className="card-meta">
              <Badge variant="secondary">{t[memory.kind]}</Badge>
              <Badge variant="outline">{memory.project}</Badge>
            </div>
            <h1 className="detail-title">{memory.title}</h1>
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
          <section className="detail-history">
            <div className="section-heading">
              <h2>{t.revisions}</h2>
              {revisions === null && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyBusy}
                  onClick={() => void loadHistory()}
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
        </>
      )}
    </main>
  )
}
function Workspace({
  t,
  locale,
  authState,
  api,
}: {
  t: Messages
  locale: Locale
  authState: 'ready' | 'unconfigured'
  api: ReturnType<typeof useWorkspace>['api']
}) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [project, setProject] = useState('global')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(authState === 'ready')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Memory | 'new' | null>(null)
  const [searchMode, setSearchMode] = useState('')
  const [revisions, setRevisions] = useState<MemoryRevision[] | null>(null)
  const load = useCallback(async () => {
    if (authState !== 'ready')
      return
    setLoading(true)
    setError('')
    try {
      const result = await api<{ memories: Memory[] }>(
        `memories?project=${encodeURIComponent(project)}&offset=${offset}`,
      )
      setMemories(result.memories)
      setSearchMode('')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setLoading(false)
    }
  }, [api, authState, offset, project, t.loadError])
  useEffect(() => {
    void load()
  }, [load])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    }
    catch (err) {
      // Load failures stay inline; action failures are transient.
      toast.error(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setBusy(false)
    }
  }
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.memories}</span>
          <h1>{t.heading}</h1>
          <p>{t.intro}</p>
        </div>
        <Button
          disabled={authState !== 'ready' || busy}
          onClick={() => setEditing('new')}
        >
          <Plus size={16} />
          {t.newMemory}
        </Button>
      </div>
      {authState === 'unconfigured' && <SetupBanner />}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <>
        <form
          className="searchbar"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              if (!query.trim()) {
                await load()
                return
              }
              const result = await api<{ memories: Memory[], mode: string }>(
                'search',
                { method: 'POST', body: JSON.stringify({ query, project }) },
              )
              setMemories(result.memories)
              setSearchMode(result.mode)
            })
          }}
        >
          <div className="search-input">
            <Search size={18} />
            <Input
              aria-label={t.search}
              placeholder={t.searchHint}
              value={query}
              onChange={event => setQuery(event.target.value)}
              maxLength={300}
            />
          </div>
          <Input
            className="project-input"
            aria-label={t.project}
            value={project}
            onChange={(event) => {
              setProject(event.target.value)
              setOffset(0)
            }}
            maxLength={64}
          />
          <Button
            variant="secondary"
            disabled={busy || authState !== 'ready'}
          >
            {t.search}
          </Button>
        </form>
        <div className="list-meta">
          <span>{t.scopeNote}</span>
          {searchMode && (
            <Badge variant="secondary">
              {searchMode === 'hybrid' ? t.hybrid : t.keyword}
            </Badge>
          )}
        </div>
        {editing !== null && (
          <MemoryEditor
            key={editing === 'new' ? 'new' : editing.id}
            t={t}
            memory={editing}
            project={project}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={input =>
              void run(async () => {
                const data
                  = editing === 'new'
                    ? { ...input, idempotencyKey: crypto.randomUUID() }
                    : { ...input, expectedVersion: editing.version }
                await api(
                  editing === 'new' ? 'memories' : `memories/${editing.id}`,
                  {
                    method: editing === 'new' ? 'POST' : 'PATCH',
                    body: JSON.stringify(data),
                  },
                )
                setEditing(null)
                await load()
                toast.success(t.saved)
              })}
          />
        )}
        {loading && memories.length === 0 && <MemoryGridSkeleton />}
        {!loading && memories.length === 0 && editing === null && (
          <div className="empty-state">
            <div className="empty-icon">
              <BookOpen size={34} strokeWidth={1.3} />
            </div>
            <h2>{t.empty}</h2>
            <p>{t.emptyBody}</p>
            <Button
              variant="outline"
              disabled={authState !== 'ready'}
              onClick={() => setEditing('new')}
            >
              <Plus size={16} />
              {t.newMemory}
            </Button>
          </div>
        )}
        {memories.length > 0 && (
          <div className="memory-grid">
            {memories.map(memory => (
              <article key={memory.id} className="memory-card">
                <div className="card-meta">
                  <Badge variant="secondary">{t[memory.kind]}</Badge>
                  <span className="card-version">
                    v
                    {memory.version}
                  </span>
                </div>
                <h2 className="memory-card-title">
                  <Link
                    className="memory-title-link"
                    href={`/memories/${memory.id}`}
                  >
                    {memory.title}
                  </Link>
                </h2>
                <p className="memory-content memory-clamp">{memory.content}</p>
                {memory.tags.length > 0 && (
                  <div className="tags">
                    {memory.tags.map(tag => (
                      <span key={tag}>
                        #
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <details>
                  <summary>{t.source}</summary>
                  <p className="source-text">{memory.source}</p>
                </details>
                <footer className="memory-card-footer">
                  <time dateTime={memory.updatedAt}>
                    {formatDate(locale, memory.updatedAt)}
                  </time>
                  <div className="card-actions">
                    <Button asChild size="xs" variant="ghost">
                      <Link href={`/memories/${memory.id}`}>
                        {t.viewDetails}
                      </Link>
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditing(memory)}
                    >
                      {t.edit}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{ revisions: MemoryRevision[] }>(
                            `memories/${memory.id}/history`,
                          )
                          setRevisions(result.revisions)
                        })}
                    >
                      {t.history}
                    </Button>
                    <ConfirmAction
                      label={t.forget}
                      description={t.forgetConfirm}
                      cancel={t.cancel}
                      disabled={busy}
                      size="xs"
                      onConfirm={() => void run(async () => {
                        await api(`memories/${memory.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: memory.version }) })
                        await load()
                        toast.success(t.deleted)
                      })}
                    />
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}
        {!searchMode && !loading && (
          <div className="pagination">
            <Button
              variant="ghost"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              {t.previous}
            </Button>
            <Button
              variant="ghost"
              disabled={memories.length < 30 || busy}
              onClick={() => setOffset(offset + 30)}
            >
              {t.next}
              <ArrowUpRight size={14} />
            </Button>
          </div>
        )}
        {revisions !== null && (
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
        )}
      </>
    </main>
  )
}
function MemoryEditor({
  t,
  memory,
  project,
  busy,
  onCancel,
  onSave,
}: {
  t: Messages
  memory: Memory | 'new'
  project: string
  busy: boolean
  onCancel: () => void
  onSave: (input: MemoryInput) => void
}) {
  const initial
    = memory === 'new'
      ? {
          title: '',
          content: '',
          kind: 'fact' as const,
          tags: [],
          source: '',
          project,
        }
      : memory
  const [input, setInput] = useState<MemoryInput>(initial)
  const [tags, setTags] = useState(initial.tags.join(', '))
  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          project: input.project,
          title: input.title,
          content: input.content,
          kind: input.kind,
          source: input.source,
          tags: [
            ...new Set(
              tags
                .split(/[,，]/)
                .map(tag => tag.trim())
                .filter(Boolean),
            ),
          ],
        })
      }}
    >
      <div className="section-heading">
        <h2>{memory === 'new' ? t.newMemory : t.edit}</h2>
        <Badge variant="outline">{input.project}</Badge>
      </div>
      <div className="form-grid">
        <div className="field">
          <Label htmlFor="memory-title">{t.title}</Label>
          <Input
            id="memory-title"
            required
            maxLength={160}
            value={input.title}
            onChange={event =>
              setInput({ ...input, title: event.target.value })}
          />
        </div>
        <div className="field">
          <Label htmlFor="memory-kind">{t.kind}</Label>
          <select
            id="memory-kind"
            value={input.kind}
            onChange={event =>
              setInput({
                ...input,
                kind: event.target.value as MemoryInput['kind'],
              })}
          >
            {(['preference', 'fact', 'decision', 'experience'] as const).map(
              kind => (
                <option key={kind} value={kind}>
                  {t[kind]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>
      <div className="field">
        <Label htmlFor="memory-content">{t.content}</Label>
        <Textarea
          id="memory-content"
          required
          maxLength={6000}
          rows={5}
          value={input.content}
          onChange={event =>
            setInput({ ...input, content: event.target.value })}
        />
      </div>
      <div className="field">
        <Label htmlFor="memory-tags">{t.tags}</Label>
        <Input
          id="memory-tags"
          value={tags}
          onChange={event => setTags(event.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor="memory-source">{t.source}</Label>
        <Input
          id="memory-source"
          required
          maxLength={1000}
          placeholder={t.sourceHint}
          value={input.source}
          onChange={event =>
            setInput({ ...input, source: event.target.value })}
        />
      </div>
      <div className="form-actions">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {t.cancel}
        </Button>
        <Button disabled={busy}>{t.save}</Button>
      </div>
    </form>
  )
}
