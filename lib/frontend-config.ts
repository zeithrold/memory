import type { Locale, SiteFooterProps } from '@ztd-me/frontend'

export function memoryFooter(locale: Locale): SiteFooterProps {
  return {
    copyright: '© Zeithrold',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/zeithrold/memory',
        ariaLabel: locale === 'zh-CN' ? 'GitHub 仓库' : 'GitHub repository',
      },
      { label: 'hello@ztd.me', href: 'mailto:hello@ztd.me' },
    ],
  }
}
