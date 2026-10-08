'use client'

import { ConnectPanel } from './connect-panel'
import { useWorkspace } from './workspace-context'
import { PageHeading } from './workspace-shell'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

export default function ConnectPage(): React.JSX.Element {
  const { t } = useWorkspace()
  return (
    <div className={PAGE_CLASS}>
      <PageHeading section={t.connect} title={t.connectHeading} intro={t.connectIntro} />
      <ConnectPanel t={t} />
    </div>
  )
}
