'use client'

import type { ComponentProps } from 'react'
import * as Slot from '@radix-ui/react-slot'
import { buttonVariants } from './button-variants.js'

export type ButtonProps = ComponentProps<'button'> & {
  asChild?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
}
export function Button({
  asChild = false,
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps): React.JSX.Element {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  )
}
