'use client'

import { useEffect } from 'react'
import { Button } from './ui/button'
import { useWorkspace } from './workspace-context'

interface RouteErrorProps { error: Error & { digest?: string }, reset: () => void }

export default function RouteError({ error, reset }: RouteErrorProps): React.JSX.Element {
  const { t } = useWorkspace()
  useEffect(() => {
    console.error('Workspace route failed', { name: error.name, digest: error.digest })
  }, [error])
  return (
    <main className="page">
      <div className="error-banner" role="alert">{t.pageError}</div>
      <Button onClick={reset}>{t.retry}</Button>
    </main>
  )
}
