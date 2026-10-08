'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from './cn.js'

const layout1Class = [
  'ztd-checkbox group inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] border',
  'border-border bg-surface p-0 font-sans text-control text-foreground data-[state=checked]:border-primary',
  'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
  'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
  'data-[state=indeterminate]:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-55',
].join(' ')

export function Checkbox({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Root>): React.JSX.Element {
  return (
    <Primitive.Root className={cn(`${layout1Class} ${className}`)} {...props}>
      <Primitive.Indicator data-slot="checkbox-indicator" className={cn('ztd-checkbox-indicator flex')}>
        <Check
          data-slot="checkbox-check"
          className={cn('ztd-checkbox-check hidden group-data-[state=checked]:block')}
          aria-hidden="true"
          size={16}
        />
        <Minus
          data-slot="checkbox-mixed"
          className={cn('ztd-checkbox-mixed hidden group-data-[state=indeterminate]:block')}
          aria-hidden="true"
          size={16}
        />
      </Primitive.Indicator>
    </Primitive.Root>
  )
}
