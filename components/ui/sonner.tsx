'use client'

import type { CSSProperties } from 'react'
import type { ToasterProps } from 'sonner'
import { Toaster as Sonner } from 'sonner'

// Sonner skins its default (non-rich) toast from these custom properties, so
// the host follows the dashboard tokens instead of shipping its own theme.
const skin: CSSProperties & Record<`--${string}`, string> = {
  '--normal-bg': 'var(--card)',
  '--normal-text': 'var(--foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': '10px',
}

/** Single toast host for the whole dashboard. */
export function Toaster(props: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      position="bottom-right"
      gap={10}
      offset={24}
      mobileOffset={16}
      closeButton
      style={skin}
      toastOptions={{ classNames: { toast: 'app-toast' } }}
      {...props}
    />
  )
}
