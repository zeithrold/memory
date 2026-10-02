'use client'

import type { Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { isWorkspaceRouteActive, workspaceNavigation } from './workspace-navigation-model'

interface WorkspaceNavigationProps { t: Messages, pathname: string }

export function WorkspaceNavigation({ t, pathname }: WorkspaceNavigationProps): React.JSX.Element {
  return (
    <nav aria-label={t.workspace}>
      {workspaceNavigation.map((item) => {
        const active = isWorkspaceRouteActive(item, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            className={`nav-item ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={18} />
            {t[item.id]}
          </Link>
        )
      })}
    </nav>
  )
}
