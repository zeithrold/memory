'use client'

import type { FooterLink, SiteFooterProps } from './shell-types.js'
import { safeHref } from './href.js'

const EMPTY_LINKS: readonly FooterLink[] = []

export function SiteFooter({ copyright, links = EMPTY_LINKS }: SiteFooterProps): React.JSX.Element {
  return (
    <footer className="ztd-footer">
      <div className="ztd-chrome">
        {copyright === undefined ? null : <span>{copyright}</span>}
        <div className="ztd-footer-links">
          {links.map(link => (
            <a key={`${link.href}:${link.label}`} href={safeHref(link.href, true)} aria-label={link.ariaLabel}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
