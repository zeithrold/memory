'use client'

import type { WorkspaceValue } from './workspace-context'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { useMemo } from 'react'
import { createApi } from './api-client'
import { WorkspaceContext } from './workspace-context'

type WorkspaceProviderProps = {
  children: React.ReactNode
  t: Messages
  locale: Locale
  authState: WorkspaceValue['authState']
}

// Account/API state belongs to Memory, not a cross-site preference provider.
export function WorkspaceProvider({ children, t, locale, authState }: WorkspaceProviderProps): React.JSX.Element {
  const api = useMemo(() => createApi(authState, t), [authState, t])
  const value = useMemo(() => ({ t, locale, authState, api }), [
    api,
    authState,
    locale,
    t,
  ])
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}
