'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-scroll-area'
import { cn } from './cn.js'
import { useStyleNonce } from './portal.js'

const layout1Class = [
  'ztd-scrollbar flex touch-none p-0.5 select-none data-[orientation=vertical]:w-2.5',
  'data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col',
].join(' ')

export type ScrollAreaProps = ComponentProps<typeof Primitive.Root> & {
  viewportClassName?: string
  viewportProps?: ComponentProps<typeof Primitive.Viewport>
  scrollbars?: 'vertical' | 'horizontal' | 'both'
}
export function ScrollArea({
  className = '',
  children,
  viewportClassName = '',
  viewportProps,
  scrollbars = 'vertical',
  ...props
}: ScrollAreaProps): React.JSX.Element {
  const nonce = useStyleNonce()
  return (
    <Primitive.Root
      data-slot="scroll-area"
      className={cn(`ztd-scroll-area relative overflow-hidden ${className}`)}
      {...props}
    >
      <Primitive.Viewport
        {...(nonce === undefined ? {} : { nonce })}
        {...viewportProps}
        className={cn(`ztd-scroll-viewport size-full rounded-[inherit] ${viewportClassName}`)}
      >
        {children}
      </Primitive.Viewport>
      {scrollbars !== 'horizontal' && <ScrollBar orientation="vertical" />}
      {scrollbars !== 'vertical' && <ScrollBar orientation="horizontal" />}
      <Primitive.Corner data-slot="scroll-corner" className={cn('ztd-scroll-corner bg-muted')} />
    </Primitive.Root>
  )
}
export function ScrollBar({
  className = '',
  orientation = 'vertical',
  ...props
}: ComponentProps<typeof Primitive.ScrollAreaScrollbar>): React.JSX.Element {
  return (
    <Primitive.ScrollAreaScrollbar
      className={cn(`${layout1Class} ${className}`)}
      orientation={orientation}
      {...props}
    >
      <Primitive.ScrollAreaThumb
        data-slot="scroll-thumb"
        className={cn('ztd-scroll-thumb relative flex-1 rounded-full bg-muted-foreground')}
      />
    </Primitive.ScrollAreaScrollbar>
  )
}
