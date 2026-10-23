'use client'
import type { MemoryWorkspaceContentProps } from './memory-workspace-content'
import type { Memory } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { ArrowUpRight, Plus } from 'lucide-react'

import { MemoryCard } from './memory-card'
import { MemoryGridSkeleton } from './skeletons'
import { Button } from './ui/button'

const EMPTY_STATE_CLASS = [
  'empty-state min-h-72 flex flex-col items-center justify-center text-center border-y border-border',
  'bg-surface/50 py-8 px-5 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[length:18px]',
  '[&_p]:text-muted-foreground [&_p]:text-body [&_p]:leading-[1.8] [&_p]:max-w-90 [&_p]:m-0',
  '[&_p]:mb-5 max-[640px]:min-h-64',
].join(' ')

const MEMORY_GRID_CLASS = [
  'memory-grid grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_320px),_1fr))] gap-4 max-[640px]:gap-3',
].join(' ')

type EmptyMemoryListProps = {
  t: Messages
  authState: 'ready' | 'unconfigured'
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
}

function EmptyMemoryList(
  { t, authState, setEditing }: EmptyMemoryListProps,
): React.JSX.Element {
  return (
    <div className={EMPTY_STATE_CLASS}>
      <svg className="empty-library-art w-36 h-22" viewBox="0 0 144 88" fill="none" aria-hidden="true">
        <rect className="library-sheet" x="26" y="8" width="68" height="64" rx="3" />
        <rect className="library-sheet" x="38" y="16" width="68" height="64" rx="3" />
        <path className="library-line" d="M50 32H86M50 40H94M50 48H80" />
        <path className="library-connection" d="M94 60H122M18 44H38" />
        <circle className="library-sheet" cx="124" cy="60" r="4" />
        <circle className="library-sheet" cx="16" cy="44" r="4" />
      </svg>
      <h2>{t.empty}</h2>
      <p>{t.emptyBody}</p>
      <Button
        variant="outline"
        disabled={authState !== 'ready'}
        onClick={() => setEditing('new')}
      >
        <Plus size={16} aria-hidden="true" />
        {t.newMemory}
      </Button>
    </div>
  )
}

type MemoryPaginationProps = {
  offset: number
  busy: boolean
  setOffset: React.Dispatch<React.SetStateAction<number>>
  t: Messages
  memories: Memory[]
}

function MemoryPagination(
  { offset, busy, setOffset, t, memories }: MemoryPaginationProps,
): React.JSX.Element {
  if (offset === 0 && memories.length === 0) {
    return <></>
  }
  return (
    <div className="pagination flex justify-end gap-3 mt-8">
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
  )
}

export function MemoryResults(
  props: MemoryWorkspaceContentProps,
): React.JSX.Element {
  return (
    <>
      {props.loading && props.memories.length === 0 && <MemoryGridSkeleton />}
      {!props.loading && props.memories.length === 0 && props.editing === null
        && (
          <EmptyMemoryList t={props.t} authState={props.authState} setEditing={props.setEditing} />
        )}
      {props.memories.length > 0 && (
        <div className={MEMORY_GRID_CLASS}>
          {props.memories.map(memory => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              t={props.t}
              locale={props.locale}
              busy={props.busy}
              setEditing={props.setEditing}
              run={props.run}
              api={props.api}
              setRevisions={props.setRevisions}
              load={props.load}
            />
          ))}
        </div>
      )}
      {!(props.searchMode.length > 0) && !props.loading && (
        <MemoryPagination
          offset={props.offset}
          busy={props.busy}
          setOffset={props.setOffset}
          t={props.t}
          memories={props.memories}
        />
      )}

    </>
  )
}
