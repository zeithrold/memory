'use client'

import type { LinkProps } from './shell-types.js'

export function NativeLink(props: LinkProps): React.JSX.Element {
  return <a {...props} />
}
