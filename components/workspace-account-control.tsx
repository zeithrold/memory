'use client'

import type { Messages } from '@/lib/i18n/messages'
import { LogOut } from 'lucide-react'
import { accessLogoutUrl } from '@/lib/access-logout'
import { Button } from './ui/button'

type WorkspaceAccountControlProps = { accessTeamDomain: string, t: Messages }

export function WorkspaceAccountControl(
  { accessTeamDomain, t }: WorkspaceAccountControlProps,
): React.JSX.Element | null {
  if (accessTeamDomain.length === 0) {
    return null
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      aria-label={t.signOut}
      onClick={() => {
        const returnTo = typeof window === 'undefined' ? '/' : window.location.origin
        window.location.href = accessLogoutUrl(accessTeamDomain, returnTo)
      }}
    >
      <LogOut size={16} aria-hidden="true" />
      <span className="max-sm:sr-only">{t.signOut}</span>
    </Button>
  )
}
