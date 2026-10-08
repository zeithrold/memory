'use client'

import { UsagePanel } from './usage-panel'
import { useWorkspace } from './workspace-context'
import { PageHeading, SetupBanner } from './workspace-shell'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

export default function UsagePage(): React.JSX.Element {
  const { t, api, authState } = useWorkspace()
  return (
    <div className={PAGE_CLASS}>
      <PageHeading section={t.usage} title={t.usageHeading} intro={t.usageIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <UsagePanel t={t} api={api} ready={authState === 'ready'} />
    </div>
  )
}
