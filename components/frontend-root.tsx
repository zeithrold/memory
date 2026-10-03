'use client'

import type { FrontendBootstrap } from '@/lib/frontend-preferences'
import { FrontendProvider } from '@/components/ui/ztd-me/client'

export function FrontendRoot(
  { children, initialPreferences, policy }: FrontendBootstrap & { children: React.ReactNode },
): React.JSX.Element {
  return <FrontendProvider initialPreferences={initialPreferences} policy={policy}>{children}</FrontendProvider>
}
