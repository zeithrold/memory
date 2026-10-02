'use client'

import { MemoryDetail } from './memory-detail-model'
import { Workspace } from './memory-workspace-model'
import { useWorkspace } from './workspace-context'

/**
 * `/memories/[id]` renders the detail page; every other view keeps the tabbed
 * workspace, so a nav click always returns to the list route's own content.
 */
interface MemoriesPageProps { memoryId?: string }

export function MemoriesPage(
  { memoryId }: MemoriesPageProps,
): React.JSX.Element {
  const { t, locale, authState, api } = useWorkspace()
  if (memoryId !== undefined && memoryId.length > 0) {
    return <MemoryDetail t={t} locale={locale} memoryId={memoryId} authState={authState} api={api} />
  }
  return <Workspace t={t} locale={locale} authState={authState} api={api} />
}
