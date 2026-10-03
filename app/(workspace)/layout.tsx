import WorkspaceShell from '@/components/workspace-shell'

export const dynamic = 'force-dynamic'
export default function Layout(
  { children }: Readonly<{ children: React.ReactNode }>,
): React.JSX.Element {
  /* eslint-disable node/prefer-global/process -- Preserve Vinext build-time inlining. */
  const accessTeamDomain = process.env.NEXT_PUBLIC_ACCESS_TEAM_DOMAIN ?? ''
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''
  const sentryRelease = process.env.SENTRY_RELEASE ?? ''
  /* eslint-enable node/prefer-global/process */
  return (
    <WorkspaceShell
      accessTeamDomain={accessTeamDomain}
      sentryDsn={sentryDsn}
      sentryRelease={sentryRelease}
    >
      {children}
    </WorkspaceShell>
  )
}
