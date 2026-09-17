'use client'

import { ConnectPanel } from './connect-panel'
import { PageHeading, useWorkspace } from './workspace-shell'

export default function ConnectPage() {
  const { t } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.connect} title={t.connectHeading} intro={t.connectIntro} />
      <ConnectPanel t={t} />
    </main>
  )
}
