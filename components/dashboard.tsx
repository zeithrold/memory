'use client'

import type { Tab } from './app'
import type { Memory, MemoryInput, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { ArrowUpRight, BookOpen, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { ConfirmAction } from './confirm-action'
import { ConnectPanel, TokenPanel, UsagePanel } from './panels'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

export type Api = <T>(path: string, init?: RequestInit) => Promise<T>
const problemSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})
export function Dashboard({
  t,
  locale,
  tab,
  authState,
  getToken,
}: {
  t: Messages
  locale: Locale
  tab: Tab
  authState: 'ready' | 'unconfigured'
  getToken?: () => Promise<string | null>
}) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [project, setProject] = useState('global')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Memory | 'new' | null>(null)
  const [searchMode, setSearchMode] = useState('')
  const [revisions, setRevisions] = useState<MemoryRevision[] | null>(null)
  const api: Api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken?.()
      if (token === null || token === undefined || token.length === 0)
        throw new Error(t.signIn)
      const response = await fetch(`/api/v1/${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...init?.headers,
        },
      })
      if (!response.ok) {
        const body: unknown = await response.json()
        const parsed = problemSchema.safeParse(body)
        throw new Error(
          parsed.success
            ? `${parsed.data.error.message} (${parsed.data.error.code})`
            : t.loadError,
        )
      }
      return (response.status === 204 ? undefined : await response.json()) as T
    },
    [getToken, t],
  )
  const load = useCallback(async () => {
    if (authState !== 'ready')
      return
    setBusy(true)
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
      setBusy(false)
    }
  }, [api, authState, offset, project, t.loadError])
  useEffect(() => {
    if (tab === 'memories')
      void load()
  }, [load, tab])
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setBusy(false)
    }
  }
  const headings = {
    memories: [t.heading, t.intro],
    tokens: [t.tokensHeading, t.tokensIntro],
    usage: [t.usageHeading, t.usageIntro],
    connect: [t.connectHeading, t.connectIntro],
  }
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t[tab]}</span>
          <h1>{headings[tab][0]}</h1>
          <p>{headings[tab][1]}</p>
        </div>
        {tab === 'memories' && (
          <Button
            disabled={authState !== 'ready' || busy}
            onClick={() => setEditing('new')}
          >
            <Plus size={16} />
            {t.newMemory}
          </Button>
        )}
      </div>
      {authState === 'unconfigured' && (
        <div className="setup-banner" role="status">
          <strong>{t.setup}</strong>
          <p>{t.setupBody}</p>
          <small>{t.setupHelp}</small>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {tab === 'memories' && (
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
                  setNotice(t.saved)
                })}
            />
          )}
          {busy && <p role="status">{t.working}</p>}
          {!busy && memories.length === 0 && editing === null && (
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
          <div className="memory-grid">
            {memories.map(memory => (
              <Card key={memory.id} className="memory-card">
                <CardContent>
                  <div className="card-meta">
                    <Badge variant="secondary">{t[memory.kind]}</Badge>
                    <span>
                      v
                      {memory.version}
                    </span>
                  </div>
                  <h2>{memory.title}</h2>
                  <p className="memory-content">{memory.content}</p>
                  <div className="tags">
                    {memory.tags.map(tag => (
                      <span key={tag}>
                        #
                        {tag}
                      </span>
                    ))}
                  </div>
                  <details>
                    <summary>{t.source}</summary>
                    <p className="source-text">{memory.source}</p>
                  </details>
                  <div className="card-footer">
                    <time dateTime={memory.updatedAt}>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                      }).format(new Date(memory.updatedAt))}
                    </time>
                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing(memory)}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        size="sm"
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
                        onConfirm={() => void run(async () => {
                          await api(`memories/${memory.id}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion: memory.version }) })
                          await load()
                          setNotice(t.deleted)
                        })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {!searchMode && (
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
            <section className="editor">
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
              <div className="memory-grid">
                {revisions.map(revision => (
                  <Card key={revision.version} className="memory-card">
                    <CardContent>
                      <div className="card-meta">
                        <Badge variant="secondary">{t[revision.kind]}</Badge>
                        <span>
                          v
                          {revision.version}
                        </span>
                        <time dateTime={revision.created_at}>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(revision.created_at))}
                        </time>
                      </div>
                      <h3>{revision.title}</h3>
                      <p className="memory-content">{revision.content}</p>
                      <details>
                        <summary>{t.source}</summary>
                        <p className="source-text">{revision.source}</p>
                      </details>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {tab === 'tokens' && (
        <TokenPanel t={t} api={api} ready={authState === 'ready'} />
      )}
      {tab === 'usage' && (
        <UsagePanel t={t} api={api} ready={authState === 'ready'} />
      )}
      {tab === 'connect' && <ConnectPanel t={t} />}
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
