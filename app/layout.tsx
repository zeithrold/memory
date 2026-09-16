import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shared Memory — Your context, carried forward',
  description: 'A private memory library for your AI agents.',
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale
    = (await cookies()).get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en'
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
