'use client'

import { TokenPanel } from './panels'
import { useWorkspace } from './workspace-context'
import { PageHeading, SetupBanner } from './workspace-shell'

export default function TokensPage(): React.JSX.Element {
  const { t, api, authState } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.tokens} title={t.tokensHeading} intro={t.tokensIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <TokenPanel t={t} api={api} ready={authState === 'ready'} />
    </main>
  )
}
