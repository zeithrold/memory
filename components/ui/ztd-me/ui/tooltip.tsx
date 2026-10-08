'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-tooltip'
import { cn } from './cn.js'
import { usePortalContainer } from './portal.js'

const layout1Class = [
  'ztd-tooltip z-130 max-w-[min(320px,calc(100vw-32px))] rounded-md bg-primary px-3 py-2 font-sans',
  'text-help text-primary-foreground wrap-anywhere',
].join(' ')

export const TooltipProvider = Primitive.Provider
export const Tooltip = Primitive.Root
export const TooltipTrigger = Primitive.Trigger
export type TooltipContentProps = ComponentProps<typeof Primitive.Content> & {
  container?: HTMLElement | null
}
export function TooltipContent({
  className = '',
  children,
  container,
  sideOffset = 6,
  ...props
}: TooltipContentProps): React.JSX.Element {
  const inheritedContainer = usePortalContainer()
  return (
    <Primitive.Portal container={container ?? inheritedContainer}>
      <Primitive.Content className={cn(`${layout1Class} ${className}`)} sideOffset={sideOffset} {...props}>
        {children}
        <Primitive.Arrow data-slot="tooltip-arrow" className={cn('ztd-tooltip-arrow fill-primary')} />
      </Primitive.Content>
    </Primitive.Portal>
  )
}
