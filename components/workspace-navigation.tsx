'use client'

import type { Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { isWorkspaceRouteActive, workspaceNavigation } from './workspace-navigation-model'

const WORKSPACE_NAVIGATION_CLASS = [
  'workspace-navigation flex flex-wrap gap-1 max-w-320 mx-auto py-2 px-8 max-[640px]:px-4',
].join(' ')

const NAV_ITEM_CLASS = [
  'nav-item flex items-center gap-3 py-3 px-4 border-0 rounded-[8px] text-muted-foreground bg-transparent',
  'text-left text-control hover:bg-muted hover:text-foreground [&.active]:bg-muted',
  '[&.active]:text-foreground [&.active]:font-[650] max-[640px]:py-3 max-[640px]:px-2 max-[640px]:gap-2',
  'max-[640px]:text-help max-[640px]:flex-[1_1_auto] max-[640px]:justify-center',
].join(' ')

type WorkspaceNavigationProps = { t: Messages, pathname: string }

export function WorkspaceNavigation({ t, pathname }: WorkspaceNavigationProps): React.JSX.Element {
  return (
    <nav className={WORKSPACE_NAVIGATION_CLASS} aria-label={t.workspace}>
      {workspaceNavigation.map((item) => {
        const active = isWorkspaceRouteActive(item, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            className={`${NAV_ITEM_CLASS} ${active ? 'active' : ''}`}
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
