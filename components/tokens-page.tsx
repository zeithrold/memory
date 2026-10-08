'use client'

import { TokenPanel } from './panels'
import { useWorkspace } from './workspace-context'
import { PageHeading, SetupBanner } from './workspace-shell'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

export default function TokensPage(): React.JSX.Element {
  const { t, api, authState } = useWorkspace()
  return (
    <div className={PAGE_CLASS}>
      <PageHeading section={t.tokens} title={t.tokensHeading} intro={t.tokensIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <TokenPanel t={t} api={api} ready={authState === 'ready'} />
    </div>
  )
}
