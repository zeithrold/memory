import { PublicRouteShell } from '@/components/public-route-shell'

export default function Layout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <PublicRouteShell>{children}</PublicRouteShell>
}
