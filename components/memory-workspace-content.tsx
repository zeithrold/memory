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

export interface MemoryWorkspaceContentProps {
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

interface MemoryWorkspaceHeadingProps {
  props: MemoryWorkspaceContentProps
}

function MemoryWorkspaceHeading({ props }: MemoryWorkspaceHeadingProps): React.JSX.Element {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{props.t.memories}</span>
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
export function MemoryWorkspaceContent(props: MemoryWorkspaceContentProps): React.JSX.Element {
  return (
    <div className="page">
      <MemoryWorkspaceHeading props={props} />
      {props.authState === 'unconfigured' && <SetupBanner />}
      {(props.error.length > 0) && (
        <div className="error-banner" role="alert">
          {props.error}
        </div>
      )}
      <>
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
        <div className="list-meta">
          <span>{props.t.scopeNote}</span>
          {(props.searchMode.length > 0) && (
            <Badge variant="secondary">
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
