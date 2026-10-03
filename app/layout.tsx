import type { Metadata } from 'next'
import { FrontendRoot } from '@/components/frontend-root'
import { frontendRootAttributes } from '@/components/ui/ztd-me'
import { readFrontendBootstrap } from '@/lib/server/frontend-preferences'
import '@/components/ui/ztd-me/styles.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shared Memory — Your context, carried forward',
  description: 'A private memory library for your AI agents.',
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const bootstrap = await readFrontendBootstrap()
  return (
    <html {...frontendRootAttributes(bootstrap.initialPreferences)}>
      <body><FrontendRoot {...bootstrap}>{children}</FrontendRoot></body>
    </html>
  )
}
