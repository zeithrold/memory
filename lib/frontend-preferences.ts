import type { FrontendPreferences, PreferencePolicy } from '@ztd-me/frontend'
import {
  createPreferencePolicy,
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
  const initialPreferences = resolveInitialPreferences({ policy, cookieHeader, acceptLanguage })
  return { policy, initialPreferences }
}

function deploymentEnvironment(origin: URL): 'production' | 'preview' | 'development' {
  if (origin.origin === 'https://memory.ztd.me') {
    return 'production'
  }
  return origin.protocol === 'http:' ? 'development' : 'preview'
}
