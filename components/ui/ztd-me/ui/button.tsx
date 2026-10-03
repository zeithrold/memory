'use client'

import type { ComponentProps } from 'react'
import * as Slot from '@radix-ui/react-slot'

export function Button({ asChild = false, className = '', ...props }: ComponentProps<'button'> & {
  asChild?: boolean
}): React.JSX.Element {
  const Component = asChild ? Slot.Root : 'button'
  return <Component className={`ztd-control ${className}`} {...props} />
}
