import type { Metadata } from 'next'
import { FrontendRoot } from '@/components/frontend-root'
import { frontendRootAttributes } from '@/components/ui/ztd-me'
import { readFrontendBootstrap } from '@/lib/server/frontend-preferences'
import './globals.css'

const SCROLL_SMOOTH_CLASS = [
  'scroll-smooth scroll-pt-8 motion-reduce:scroll-auto [color-scheme:var(--ztd-color-scheme)]',
].join(' ')

const M_0_CLASS = ['m-0 min-w-80 bg-background font-sans text-body text-foreground [font-synthesis:none]'].join(' ')

export const metadata: Metadata = {
  title: 'Shared Memory — Your context, carried forward',
  description: 'A private memory library for your AI agents.',
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  const bootstrap = await readFrontendBootstrap()
  return (
    <html className={SCROLL_SMOOTH_CLASS} {...frontendRootAttributes(bootstrap.initialPreferences)}>
      <body className={M_0_CLASS}><FrontendRoot {...bootstrap}>{children}</FrontendRoot></body>
    </html>
  )
}
