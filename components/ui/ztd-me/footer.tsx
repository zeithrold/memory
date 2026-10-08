'use client'

import type { FooterLink, SiteFooterProps } from './shell-types.js'
import { safeHref } from './href.js'
import { cn } from './ui/cn.js'

const layout1Class = [
  'ztd-chrome mx-auto flex max-w-320 flex-wrap items-start justify-between gap-3 px-4 py-6 sm:flex-nowrap',
  'sm:items-center sm:gap-4 sm:px-6 lg:px-8',
].join(' ')

const EMPTY_LINKS: readonly FooterLink[] = []

export function SiteFooter({ copyright, links = EMPTY_LINKS }: SiteFooterProps): React.JSX.Element {
  return (
    <footer className={cn('ztd-footer border-t border-border bg-background text-help')}>
      <div className={cn(layout1Class)}>
        {copyright === undefined ? null : <span>{copyright}</span>}
        <div className={cn('ztd-footer-links flex flex-wrap items-center gap-3 sm:gap-4')}>
          {links.map(link => (
            <a
              key={`${link.href}:${link.label}`}
              href={safeHref(link.href, true)}
              className={cn('text-foreground underline-offset-3')}
              aria-label={link.ariaLabel}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
