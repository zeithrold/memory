import { cookies } from 'next/headers'
import App from '@/components/app'

export const dynamic = 'force-dynamic'
export default async function Page() {
  const locale
    = (await cookies()).get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en'
  // Vite replaces the global expression; importing node:process prevents it.
  // eslint-disable-next-line node/prefer-global/process
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  return (
    <App
      initialLocale={locale}
      publishableKey={publishableKey}
    />
  )
}
