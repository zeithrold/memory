'use client'

import { CatalogPanel } from './catalog'
import { useWorkspace } from './workspace-context'
import { PageHeading, SetupBanner } from './workspace-shell'

export default function CatalogPage(): React.JSX.Element {
  const { t, api, authState } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.catalog} title={t.catalogHeading} intro={t.catalogIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <CatalogPanel t={t} api={api} ready={authState === 'ready'} />
    </main>
  )
}
