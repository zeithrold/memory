import { cookies } from 'next/headers'
import WorkspaceShell from '@/components/workspace-shell'

export const dynamic = 'force-dynamic'
export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = (await cookies()).get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en'
  /* eslint-disable node/prefer-global/process */
  const accessTeamDomain = process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN ?? ''
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''
  const sentryRelease = process.env.SENTRY_RELEASE ?? ''
  /* eslint-enable node/prefer-global/process */
  return (
    <WorkspaceShell
      initialLocale={locale}
      accessTeamDomain={accessTeamDomain}
      sentryDsn={sentryDsn}
      sentryRelease={sentryRelease}
    >
      {children}
    </WorkspaceShell>
  )
}
