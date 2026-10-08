'use client'
import type { MemoryWorkspaceContentProps } from './memory-workspace-content'
import type { Memory } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { ArrowUpRight, BookOpen, Plus } from 'lucide-react'

import { MemoryCard } from './memory-card'
import { MemoryGridSkeleton } from './skeletons'
import { Button } from './ui/button'

const EMPTY_STATE_CLASS = [
  'empty-state min-h-[330px] flex flex-col items-center justify-center text-center py-10 px-4 [&_h2]:mt-1',
  '[&_h2]:mx-0 [&_h2]:mb-2 [&_h2]:text-[length:19px] [&_p]:text-muted-foreground [&_p]:text-body',
  '[&_p]:leading-[1.9] [&_p]:max-w-[350px] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-6 max-[640px]:min-h-70',
].join(' ')

const EMPTY_ICON_CLASS = [
  'empty-icon h-19 w-19 border border-border rounded-[25px] bg-muted grid [place-items:center]',
  'text-muted-foreground transform-[rotate(-6deg)] mb-5',
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
      <div className={EMPTY_ICON_CLASS}>
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
