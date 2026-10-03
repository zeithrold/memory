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
  if (origin.origin === 'https://memory.ztd.me') {
    return createPreferencePolicy({
      name: 'ztd.frontend.v1',
      domain: 'ztd.me',
      secure: true,
      mirrorKey: 'ztd.frontend.v1',
    })
  }
  const name = origin.protocol === 'http:'
    ? 'ztd.frontend.development.memory.v1'
    : 'ztd.frontend.preview.memory.v1'
  return createPreferencePolicy({
    name,
    secure: origin.protocol === 'https:',
    mirrorKey: name,
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
