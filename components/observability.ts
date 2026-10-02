'use client'

import * as Sentry from '@sentry/react'
import {
  environmentFromOrigin,
  TRACES_SAMPLE_RATE,
} from '@/lib/observability'

let started = false

interface BrowserObservabilityProps {
  dsn: string
  release: string
}

export function BrowserObservability({
  dsn,
  release,
}: BrowserObservabilityProps): null {
  if (!started && dsn !== '' && typeof window !== 'undefined') {
    started = true

    const environment = environmentFromOrigin(window.location.origin)

    Sentry.init({
      dsn,
      environment,
      release: release === '' ? undefined : release,

      integrations: [
        Sentry.browserTracingIntegration(),
      ],

      tracesSampleRate: TRACES_SAMPLE_RATE[environment],
      sendDefaultPii: false,
    })
  }

  return null
}
