'use client'

import { useEffect } from 'react'
import { Button } from './ui/button'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
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
