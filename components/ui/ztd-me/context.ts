'use client'

import type { PreferenceSnapshot, PreferenceStore } from './store-types.js'
import { createContext, use } from 'react'

export interface PreferenceContextValue extends PreferenceSnapshot {
  setMode: PreferenceStore['setMode']
  setPalette: PreferenceStore['setPalette']
  setLocale: PreferenceStore['setLocale']
  portalContainer: HTMLElement | null
  styleNonce: string | undefined
}
export const PreferenceContext = createContext<PreferenceContextValue | null>(null)
export function useFrontendPreferences(): PreferenceContextValue {
  const value = use(PreferenceContext)
  if (value === null) {
    throw new Error('useFrontendPreferences requires FrontendProvider')
  }
  return value
}
