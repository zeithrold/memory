import { cookies } from 'next/headers'
import App from '@/components/app'

export const dynamic = 'force-dynamic'
export default async function Page() {
  const locale
    = (await cookies()).get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en'
  // Vite replaces the global expressions; importing node:process prevents it.
  /* eslint-disable node/prefer-global/process */
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''
  const sentryRelease = process.env.SENTRY_RELEASE ?? ''
  /* eslint-enable node/prefer-global/process */
  return (
    <App
      initialLocale={locale}
      publishableKey={publishableKey}
      sentryDsn={sentryDsn}
      sentryRelease={sentryRelease}
    />
  )
}
