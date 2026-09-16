'use client'

import * as Sentry from '@sentry/react'
import { environmentFromOrigin } from '@/lib/observability'

let started = false
/**
 * Starts browser error reporting once per page load. Called during the first
 * render rather than from an effect so failures during hydration are still
 * captured, and stays a no-op when the build has no public DSN.
 */
export function BrowserObservability({
  dsn,
  release,
}: {
  dsn: string
  release: string
}) {
  if (!started && dsn !== '' && typeof window !== 'undefined') {
    started = true
    Sentry.init({
      dsn,
      environment: environmentFromOrigin(window.location.origin),
      release: release === '' ? undefined : release,
      // Errors only: the dashboard is small and browser tracing adds no signal.
      tracesSampleRate: 0,
      sendDefaultPii: false,
    })
  }
  return null
}
