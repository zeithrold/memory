'use client'

import type { ReactNode } from 'react'
import type { FrontendPreferences, PreferencePolicy } from './types.js'
import { setNonce } from 'get-nonce'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { PreferenceContext } from './context.js'
import { frontendRootAttributes } from './cookies.js'
import { createPreferenceStore } from './store.js'

export interface FrontendProviderProps {
  initialPreferences: FrontendPreferences
  policy: PreferencePolicy
  children: ReactNode
  portalContainer?: HTMLElement | null
  styleNonce?: string
  onPreferencesChange?: (preferences: FrontendPreferences) => void
  onPersistenceError?: () => void
}
export function FrontendProvider(props: FrontendProviderProps): React.JSX.Element {
  const [store] = useState(() => createPreferenceStore(props.initialPreferences, props.policy))
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  const { onPreferencesChange, onPersistenceError, portalContainer, styleNonce } = props
  useEffect(() => {
    if (styleNonce !== undefined) {
      setNonce(styleNonce)
    }
  }, [styleNonce])
  useEffect(() => store.connect(), [store])
  useEffect(() => {
    const attributes = frontendRootAttributes(snapshot.preferences)
    for (const [key, value] of Object.entries(attributes)) {
      document.documentElement.setAttribute(key, value)
    }
    onPreferencesChange?.(snapshot.preferences)
  }, [snapshot.preferences, onPreferencesChange])
  useEffect(() => {
    if (snapshot.persistence === 'unavailable') {
      onPersistenceError?.()
    }
  }, [snapshot.persistence, onPersistenceError])
  const value = useMemo(() => ({
    ...snapshot,
    setMode: store.setMode,
    setPalette: store.setPalette,
    setLocale: store.setLocale,
    portalContainer: portalContainer ?? null,
    styleNonce,
  }), [
    snapshot,
    store,
    portalContainer,
    styleNonce,
  ])
  return <PreferenceContext value={value}>{props.children}</PreferenceContext>
}
