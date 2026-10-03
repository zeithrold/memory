import type { FrontendPreferences, PreferencePolicy } from '@ztd-me/frontend'
import {
  createPreferencePolicy,
  migrateLegacyPreferences,
  readPreferenceCookie,
  resolveInitialPreferences,
} from '@ztd-me/frontend'

export interface FrontendBootstrap {
  initialPreferences: FrontendPreferences
  policy: PreferencePolicy
}

// APP_ORIGIN is a trusted Worker binding. Request Host never selects cookie scope.
export function memoryPreferencePolicy(appOrigin: string): PreferencePolicy {
  const origin = new URL(appOrigin)
  const environment = deploymentEnvironment(origin)
  return createPreferencePolicy({
    environment,
    namespace: 'memory',
    hostname: origin.hostname,
    protocol: origin.protocol === 'https:' ? 'https:' : 'http:',
  })
}

export function memoryFrontendBootstrap(
  appOrigin: string,
  cookieHeader: string,
  acceptLanguage: string | undefined,
): FrontendBootstrap {
  const policy = memoryPreferencePolicy(appOrigin)
  const initial = resolveInitialPreferences({ policy, cookieHeader, acceptLanguage })
  const read = readPreferenceCookie(cookieHeader, policy)
  // Preserve Memory's existing Chinese SSR before the first shared selection.
  const legacy = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith('locale='))
  const initialPreferences = read.status === 'missing'
    ? migrateLegacyPreferences(legacy?.slice(7), 'memory', initial)
    : initial
  return { policy, initialPreferences }
}

function deploymentEnvironment(origin: URL): 'production' | 'preview' | 'development' {
  if (origin.origin === 'https://memory.ztd.me') {
    return 'production'
  }
  return origin.protocol === 'http:' ? 'development' : 'preview'
}
