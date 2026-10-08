'use client'
import type { Api } from './api-client'
import type { MemoryWorkspaceContentProps } from './memory-workspace-view'
import type { useWorkspace } from './workspace-context'
import type { Memory, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  memoryListResponse,
} from './api-schemas'
import { perform } from './async-action'
import { MemoryWorkspaceContent } from './memory-workspace-view'

type WorkspaceProps = {
  t: Messages
  locale: Locale
  authState: 'ready' | 'unconfigured'
  api: ReturnType<typeof useWorkspace>['api']
}

type LoadWorkspaceMemoriesContext = {
  authState: 'ready' | 'unconfigured'
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  api: Api
  project: string
  offset: number
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>
  setSearchMode: React.Dispatch<React.SetStateAction<string>>
  t: Messages
}

async function loadWorkspaceMemories(
  context: LoadWorkspaceMemoriesContext,
): Promise<void> {
  const { authState, setLoading, setError, api, project, offset, setMemories, setSearchMode, t } = context

  if (authState !== 'ready') {
    return
  }
  setLoading(true)
  setError('')
  try {
    const result = await api(
      `memories?project=${encodeURIComponent(project)}&offset=${offset}`,
      memoryListResponse,
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
}

type RunMemoryWorkspaceActionContext = {
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  t: Messages
}

async function runMemoryWorkspaceAction(
  context: RunMemoryWorkspaceActionContext,
  action: () => Promise<void>,
): Promise<void> {
  const { setBusy, setError, t } = context

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

type WorkspaceModel = Pick<
  MemoryWorkspaceContentProps,
  'busy'
  | 'setEditing'
  | 'error'
  | 'run'
  | 'query'
  | 'load'
  | 'setMemories'
  | 'setSearchMode'
  | 'setQuery'
  | 'project'
  | 'setProject'
  | 'setOffset'
  | 'searchMode'
  | 'editing'
  | 'loading'
  | 'memories'
  | 'setRevisions'
  | 'offset'
  | 'revisions'
>

function useMemoryWorkspaceModel(
  { t, authState, api }: WorkspaceProps,
): WorkspaceModel {
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

  const load = useCallback(
    async () => await loadWorkspaceMemories(
      { authState, setLoading, setError, api, project, offset, setMemories, setSearchMode, t },
    ),
    [
      api,
      authState,
      offset,
      project,
      t,
    ],
  )

  useEffect(() => {
    perform(load(), t.loadError)
  }, [load, t.loadError])

  const run = async (
    action: () => Promise<void>,
  ) => await runMemoryWorkspaceAction({ setBusy, setError, t }, action)
  return {
    busy,
    setEditing,
    error,
    run,
    query,
    load,
    setMemories,
    setSearchMode,
    setQuery,
    project,
    setProject,
    setOffset,
    searchMode,
    editing,
    loading,
    memories,
    setRevisions,
    offset,
    revisions,
  }
}

export function Workspace(
  {
    t,
    locale,
    authState,
    api,
  }: WorkspaceProps,
): React.JSX.Element {
  const model = useMemoryWorkspaceModel({ t, locale, authState, api })
  return <MemoryWorkspaceContent {...model} t={t} authState={authState} api={api} locale={locale} />
}
