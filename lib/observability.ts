/**
 * Deployment environments for error reporting. `stage` is local development
 * (anything served from an http origin or localhost, including the e2e preview);
 * every deployment is `production`. Consumed by both the Worker and the browser
 * so an event can never be labelled two different ways.
 */
export type SentryEnvironment = 'stage' | 'production'

export const TRACES_SAMPLE_RATE: Record<SentryEnvironment, number> = {
  stage: 1,
  production: 0.5,
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function environmentFromOrigin(origin: string): SentryEnvironment {
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' || LOCAL_HOSTS.has(url.hostname))
      return 'stage'
    return 'production'
  }
  catch {
    // An unparseable origin is never a valid production configuration, but
    // labelling it `stage` would hide real production errors from alerts.
    return 'production'
  }
}
