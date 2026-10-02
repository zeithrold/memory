'use client'

import type { Api, AuthState } from './api-client'
import type { Locale, Messages } from '@/lib/i18n/messages'
import { createContext, use } from 'react'

export interface WorkspaceValue {
  t: Messages
  locale: Locale
  authState: AuthState
  api: Api
}
export const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const value = use(WorkspaceContext)
  if (value === null) {
    throw new Error('Workspace components must be rendered inside WorkspaceShell.')
  }
  return value
}
