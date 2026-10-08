'use client'
import type { Messages } from '@/lib/i18n/messages'
import { Play } from 'lucide-react'

import { perform } from './async-action'
import { Button } from './ui/button'

export function CatalogRunControls(
  { busy, setRunDialog, t, load, runsOffset }: CatalogRunControlsProps,
): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={busy} onClick={() => setRunDialog({ dryRun: false })}>
        <Play size={16} />
        {t.runNow}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => setRunDialog({ dryRun: true })}>
        {t.dryRun}
      </Button>
      <Button variant="ghost" onClick={() => perform(load(runsOffset), t.loadError)}>
        {t.refresh}
      </Button>
    </div>
  )
}

type CatalogRunControlsProps = {
  busy: boolean
  setRunDialog: React.Dispatch<React.SetStateAction<{ dryRun: boolean } | null>>
  t: Messages
  load: (nextRunsOffset: number) => Promise<void>
  runsOffset: number
}
