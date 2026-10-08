'use client'

import { useEffect } from 'react'
import { Button } from './ui/button'
import { useWorkspace } from './workspace-context'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

const ERROR_BANNER_CLASS = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

type RouteErrorProps = { error: Error & { digest?: string }, reset: () => void }

export default function RouteError({ error, reset }: RouteErrorProps): React.JSX.Element {
  const { t } = useWorkspace()
  useEffect(() => {
    console.error('Workspace route failed', { name: error.name, digest: error.digest })
  }, [error])
  return (
    <div className={PAGE_CLASS}>
      <div
        className={ERROR_BANNER_CLASS}
        role="alert"
      >
        {t.pageError}
      </div>
      <Button onClick={reset}>{t.retry}</Button>
    </div>
  )
}
