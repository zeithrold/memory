'use client'

import { TokenPanel } from './panels'
import { PageHeading, SetupBanner, useWorkspace } from './workspace-shell'

export default function TokensPage() {
  const { t, api, authState } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.tokens} title={t.tokensHeading} intro={t.tokensIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <TokenPanel t={t} api={api} ready={authState === 'ready'} />
    </main>
  )
}
