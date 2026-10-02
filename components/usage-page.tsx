'use client'

import { UsagePanel } from './usage-panel'
import { useWorkspace } from './workspace-context'
import { PageHeading, SetupBanner } from './workspace-shell'

export default function UsagePage(): React.JSX.Element {
  const { t, api, authState } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.usage} title={t.usageHeading} intro={t.usageIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <UsagePanel t={t} api={api} ready={authState === 'ready'} />
    </main>
  )
}
