'use client'

import type { LinkProps } from '@ztd-me/frontend'
import Link from 'next/link'

export function FrontendLink(props: LinkProps): React.JSX.Element {
  return <Link {...props} prefetch={false} />
}
