'use client'
import type { Api } from './api-client'
import type { Memory, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { Plus } from 'lucide-react'

import { MemoryResults } from './memory-results'
import { MemorySearchForm } from './memory-search-form'
import { WorkspaceMemoryEditor } from './memory-workspace-editor'
import { WorkspaceHistory } from './memory-workspace-history'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { SetupBanner } from './workspace-shell'

const EYEBROW_CLASS = ['eyebrow text-help tracking-[2px] uppercase text-primary font-[650]'].join(' ')

const PAGE_HEADING_CLASS = [
  'page-heading flex items-center justify-between gap-6 mb-8 max-[1000px]:items-start',
  'max-[1000px]:flex-col max-[1000px]:gap-2 flex-wrap wrap-anywhere',
].join(' ')

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

const ERROR_BANNER_CLASS = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

const LIST_META_CLASS = [
  'list-meta flex justify-between gap-3 text-help text-muted-foreground py-4 px-1 max-[640px]:flex-col',
  'max-[640px]:leading-[1.8]',
].join(' ')

export type MemoryWorkspaceContentProps = {
  t: Messages
  authState: 'ready' | 'unconfigured'
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
  error: string
  run: (action: () => Promise<void>) => Promise<void>
  query: string
  load: () => Promise<void>
  api: Api
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>
  setSearchMode: React.Dispatch<React.SetStateAction<string>>
  setQuery: React.Dispatch<React.SetStateAction<string>>
  project: string
  setProject: React.Dispatch<React.SetStateAction<string>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
  searchMode: string
  editing: Memory | 'new' | null
  loading: boolean
  memories: Memory[]
  locale: Locale
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  offset: number
  revisions: MemoryRevision[] | null
}

type MemoryWorkspaceHeadingProps = {
  props: MemoryWorkspaceContentProps
}

function MemoryWorkspaceHeading({ props }: MemoryWorkspaceHeadingProps): React.JSX.Element {
  return (
    <div className={PAGE_HEADING_CLASS}>
      <div>
        <span className={EYEBROW_CLASS}>{props.t.memories}</span>
        <h1>{props.t.heading}</h1>
        <p>{props.t.intro}</p>
      </div>
      <Button
        disabled={props.authState !== 'ready' || props.busy}
        onClick={() => props.setEditing('new')}
      >
        <Plus size={16} />
        {props.t.newMemory}
      </Button>
    </div>
  )
}
function WorkspaceSearchForm({ props }: { props: MemoryWorkspaceContentProps }): React.JSX.Element {
  return (
    <MemorySearchForm
      run={props.run}
      query={props.query}
      load={props.load}
      api={props.api}
      setMemories={props.setMemories}
      setSearchMode={props.setSearchMode}
      t={props.t}
      setQuery={props.setQuery}
      project={props.project}
      setProject={props.setProject}
      setOffset={props.setOffset}
      busy={props.busy}
      authState={props.authState}
    />
  )
}

export function MemoryWorkspaceContent(props: MemoryWorkspaceContentProps): React.JSX.Element {
  return (
    <div className={PAGE_CLASS}>
      <MemoryWorkspaceHeading props={props} />
      {props.authState === 'unconfigured' && <SetupBanner />}
      {(props.error.length > 0) && (
        <div
          className={ERROR_BANNER_CLASS}
          role="alert"
        >
          {props.error}
        </div>
      )}
      <>
        <WorkspaceSearchForm props={props} />
        <div className={LIST_META_CLASS}>
          <span>{props.t.scopeNote}</span>
          {(props.searchMode.length > 0) && (
            <Badge variant="secondary" className="max-w-full whitespace-normal">
              {props.searchMode === 'hybrid' ? props.t.hybrid : props.t.keyword}
            </Badge>
          )}
        </div>
        {props.editing !== null && (
          <WorkspaceMemoryEditor
            editing={props.editing}
            t={props.t}
            project={props.project}
            busy={props.busy}
            setEditing={props.setEditing}
            run={props.run}
            api={props.api}
            load={props.load}
          />
        )}
        <MemoryResults {...props} />
        {props.revisions !== null && (
          <WorkspaceHistory
            t={props.t}
            setRevisions={props.setRevisions}
            revisions={props.revisions}
            locale={props.locale}
          />
        )}
      </>
    </div>
  )
}
