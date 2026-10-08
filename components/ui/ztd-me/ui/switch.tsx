'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-switch'
import { disabledClass, focusClass } from './classes.js'
import { cn } from './cn.js'

export function Switch({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Root>): React.JSX.Element {
  const classes = [
    'ztd-switch group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md',
    'border-0 bg-transparent p-0 cursor-pointer',
    focusClass,
    disabledClass,
    className,
  ].join(' ')
  return (
    <Primitive.Root data-slot="switch" className={cn(classes)} {...props}>
      <span
        className={cn('flex h-5 w-9 items-center rounded-full bg-muted p-0.5 group-data-[state=checked]:bg-primary')}
      >
        <Primitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'block size-4 rounded-full bg-surface shadow-sm transition-transform duration-150',
            'group-data-[state=checked]:translate-x-4 motion-reduce:transition-none',
          )}
        />
      </span>
    </Primitive.Root>
  )
}
