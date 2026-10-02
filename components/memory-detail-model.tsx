'use client'
import type { Api } from './api-client'
import type { MemoryDetailContentProps } from './memory-detail-view'
import type { useWorkspace } from './workspace-context'
import type { Memory, MemoryRevision } from '@/lib/contracts'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ProblemError } from './api-client'
import {
  memoryHistoryResponse,
  memoryResponse,
} from './api-schemas'
import { perform } from './async-action'
import { MemoryDetailContent } from './memory-detail-view'

interface MemoryDetailProps {
  t: Messages
  locale: Locale
  memoryId: string
  authState: 'ready' | 'unconfigured'
  api: ReturnType<typeof useWorkspace>['api']
}

interface LoadMemoryDetailContext {
  authState: 'ready' | 'unconfigured'
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  setMissing: React.Dispatch<React.SetStateAction<boolean>>
  setMemory: React.Dispatch<React.SetStateAction<Memory | null>>
  api: Api
  memoryId: string
  t: Messages
}

async function loadMemoryDetail(context: LoadMemoryDetailContext): Promise<void> {
  const { authState, setLoading, setError, setMissing, setMemory, api, memoryId, t } = context

  if (authState !== 'ready') {
    return
  }
  setLoading(true)
  setError('')
  setMissing(false)
  try {
    setMemory(await api(`memories/${memoryId}`, memoryResponse))
  }
  catch (err) {
    setMemory(null)
    if (err instanceof ProblemError && err.code === 'NOT_FOUND') {
      setMissing(true)
    }
    else {
      setError(err instanceof Error ? err.message : t.loadError)
    }
  }
  finally {
    setLoading(false)
  }
}

interface LoadMemoryHistoryContext {
  setHistoryBusy: React.Dispatch<React.SetStateAction<boolean>>
  api: Api
  memoryId: string
  setRevisions: React.Dispatch<React.SetStateAction<MemoryRevision[] | null>>
  t: Messages
}

async function loadMemoryHistory(context: LoadMemoryHistoryContext): Promise<void> {
  const { setHistoryBusy, api, memoryId, setRevisions, t } = context

  setHistoryBusy(true)
  try {
    const result = await api(
      `memories/${memoryId}/history`,
      memoryHistoryResponse,
    )
    setRevisions(result.revisions)
  }
  catch (err) {
    toast.error(err instanceof Error ? err.message : t.loadError)
  }
  finally {
    setHistoryBusy(false)
  }
}

interface RunMemoryDetailActionContext {
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  t: Messages
}

async function runMemoryDetailAction(
  context: RunMemoryDetailActionContext,
  action: () => Promise<void>,
): Promise<void> {
  const { setBusy, setError, t } = context

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

type MemoryDetailModel = Pick<
  MemoryDetailContentProps,
  'memory'
  | 'editing'
  | 'busy'
  | 'setEditing'
  | 'run'
  | 'router'
  | 'error'
  | 'loading'
  | 'missing'
  | 'load'
  | 'setRevisions'
  | 'revisions'
  | 'historyBusy'
  | 'loadHistory'
>

function useMemoryDetailModel(
  { t, memoryId, authState, api }: MemoryDetailProps,
): MemoryDetailModel {
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

  const load = useCallback(
    async () => await loadMemoryDetail({ authState, setLoading, setError, setMissing, setMemory, api, memoryId, t }),
    [
      api,
      authState,
      memoryId,
      t,
    ],
  )

  useEffect(() => {
    perform(load(), t.loadError)
  }, [load, t.loadError])

  const loadHistory = useCallback(
    async () => await loadMemoryHistory({ setHistoryBusy, api, memoryId, setRevisions, t }),
    [
      api,
      memoryId,
      t,
    ],
  )

  const run = async (
    action: () => Promise<void>,
  ) => await runMemoryDetailAction({ setBusy, setError, t }, action)
  return {
    memory,
    editing,
    busy,
    setEditing,
    run,
    router,
    error,
    loading,
    missing,
    load,
    setRevisions,
    revisions,
    historyBusy,
    loadHistory,
  }
}

export function MemoryDetail(
  {
    t,
    locale,
    memoryId,
    authState,
    api,
  }: MemoryDetailProps,
): React.JSX.Element {
  const model = useMemoryDetailModel({ t, locale, memoryId, authState, api })
  return <MemoryDetailContent {...model} t={t} api={api} authState={authState} locale={locale} />
}
