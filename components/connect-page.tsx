'use client'

import { ConnectPanel } from './connect-panel'
import { useWorkspace } from './workspace-context'
import { PageHeading } from './workspace-shell'

export default function ConnectPage(): React.JSX.Element {
  const { t } = useWorkspace()
  return (
    <div className="page">
      <PageHeading section={t.connect} title={t.connectHeading} intro={t.connectIntro} />
      <ConnectPanel t={t} />
    </div>
  )
}
