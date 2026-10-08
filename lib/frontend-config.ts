import type { Locale, SiteFooterProps } from '@/components/ui/ztd-me'
import { messages } from './i18n/messages'

export function memoryFooter(locale: Locale): SiteFooterProps {
  return {
    copyright: '© Zeithrold',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/zeithrold/memory',
        ariaLabel: messages(locale).repositoryLabel,
      },
      { label: 'hello@ztd.me', href: 'mailto:hello@ztd.me' },
    ],
  }
}
