'use client'

import type { Messages } from '@/lib/i18n/messages'
import Link from 'next/link'
import { isWorkspaceRouteActive, workspaceNavigation } from './workspace-navigation-model'

const WORKSPACE_NAVIGATION_CLASS = [
  'workspace-navigation flex flex-wrap gap-x-5 gap-y-1 w-full max-w-292 mx-auto pt-2 px-12 border-b',
  'border-border max-[1000px]:px-6 max-[640px]:px-4 max-[640px]:gap-x-3',
].join(' ')

const NAV_ITEM_CLASS = [
  'nav-item relative inline-flex items-center justify-center gap-2 min-h-12 px-1 border-b-2',
  'border-transparent text-muted-foreground text-control transition-colors hover:text-foreground',
  '[&.active]:border-accent [&.active]:text-foreground [&.active]:font-semibold',
  'focus-visible:outline-offset-[-2px] motion-reduce:transition-none max-[640px]:text-help',
  'max-[640px]:gap-1.5',
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
            <Icon size={16} aria-hidden="true" />
            {t[item.id]}
          </Link>
        )
      })}
    </nav>
  )
}
