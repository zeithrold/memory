import { BookOpen, Cable, ChartNoAxesCombined, FolderTree, KeyRound } from 'lucide-react'

// These are Memory's business routes, independent of the surrounding shell.
export const workspaceNavigation = [
  { id: 'memories', href: '/memories', icon: BookOpen },
  { id: 'catalog', href: '/catalog', icon: FolderTree },
  { id: 'tokens', href: '/tokens', icon: KeyRound },
  { id: 'usage', href: '/usage', icon: ChartNoAxesCombined },
  { id: 'connect', href: '/connect', icon: Cable },
] as const

export type WorkspaceNavigationItem = (typeof workspaceNavigation)[number]

export function isWorkspaceRouteActive(item: WorkspaceNavigationItem, pathname: string): boolean {
  return pathname === item.href
    || (item.id === 'memories' && pathname.startsWith('/memories/'))
    || (item.id === 'catalog' && pathname.startsWith('/catalog/'))
}
