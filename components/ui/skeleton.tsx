import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Placeholder block for content that is still loading. The sweep animation is
 * declared in `globals.css` and disabled under `prefers-reduced-motion`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skeleton', className)}
      {...props}
    />
  )
}

export { Skeleton }
