import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Placeholder block for content that is still loading. The sweep animation is
 * declared in `globals.css` and disabled under `prefers-reduced-motion`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skeleton relative overflow-hidden bg-muted rounded-[6px]', className)}
      {...props}
    />
  )
}

export { Skeleton }
