'use client'

import { useEffect } from 'react'
import { Button } from './ui/button'

interface RouteErrorProps { error: Error & { digest?: string }, reset: () => void }

export default function RouteError({ error, reset }: RouteErrorProps): React.JSX.Element {
  useEffect(() => {
    console.error('Workspace route failed', { name: error.name, digest: error.digest })
  }, [error])
  return (
    <main className="page">
      <div className="error-banner" role="alert">This page could not be loaded.</div>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
