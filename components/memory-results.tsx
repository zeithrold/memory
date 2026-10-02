'use client'
import type { MemoryWorkspaceContentProps } from './memory-workspace-content'
import type { Memory } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { ArrowUpRight, BookOpen, Plus } from 'lucide-react'

import { MemoryCard } from './memory-card'
import { MemoryGridSkeleton } from './skeletons'
import { Button } from './ui/button'

interface EmptyMemoryListProps {
  t: Messages
  authState: 'ready' | 'unconfigured'
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
}

function EmptyMemoryList(
  { t, authState, setEditing }: EmptyMemoryListProps,
): React.JSX.Element {
  return (
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
  )
}

interface MemoryPaginationProps {
  offset: number
  busy: boolean
  setOffset: React.Dispatch<React.SetStateAction<number>>
  t: Messages
  memories: Memory[]
}

function MemoryPagination(
  { offset, busy, setOffset, t, memories }: MemoryPaginationProps,
): React.JSX.Element {
  return (
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
        <div className="memory-grid">
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
