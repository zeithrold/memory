import { NotFoundContent } from '@/components/not-found-content'
import { PublicRouteShell } from '@/components/public-route-shell'

export default function NotFound(): React.JSX.Element {
  return <PublicRouteShell><NotFoundContent /></PublicRouteShell>
}
