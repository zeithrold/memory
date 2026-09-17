'use client'

import { CatalogPanel } from './catalog'
import { PageHeading, SetupBanner, useWorkspace } from './workspace-shell'

export default function CatalogPage() {
  const { t, api, authState } = useWorkspace()
  return (
    <main className="page">
      <PageHeading section={t.catalog} title={t.catalogHeading} intro={t.catalogIntro} />
      {authState === 'unconfigured' && <SetupBanner />}
      <CatalogPanel t={t} api={api} ready={authState === 'ready'} />
    </main>
  )
}
