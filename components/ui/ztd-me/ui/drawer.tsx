'use client'

import type { ComponentProps } from 'react'
import { Drawer as Primitive } from 'vaul'
import { footerClass, headerClass, helpClass, overlayClass, titleClass } from './classes.js'
import { cn } from './cn.js'
import { usePortalContainer } from './portal.js'

export function Drawer({
  autoFocus = true,
  ...props
}: ComponentProps<typeof Primitive.Root>): React.JSX.Element {
  return <Primitive.Root autoFocus={autoFocus} {...props} />
}
export const DrawerNestedRoot = Primitive.NestedRoot
export const DrawerTrigger = Primitive.Trigger
export const DrawerClose = Primitive.Close
export const DrawerPortal = Primitive.Portal
export type DrawerContentProps = ComponentProps<typeof Primitive.Content> & { container?: HTMLElement | null }
export function DrawerContent({
  className = '',
  children,
  container,
  ...props
}: DrawerContentProps): React.JSX.Element {
  const inheritedContainer = usePortalContainer()
  const classes = [
    'ztd-drawer fixed inset-x-0 bottom-0 z-111 max-h-[88dvh] rounded-t-2xl safe-area-bottom',
    'data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:bottom-auto',
    'ztd-overlay flex flex-col gap-4 overflow-y-auto border border-border bg-surface p-5',
    'font-sans text-body text-foreground motion-reduce:animate-none motion-reduce:transition-none',
    className,
  ].join(' ')
  return (
    <Primitive.Portal container={container ?? inheritedContainer}>
      <Primitive.Overlay className={cn(overlayClass)} />
      <Primitive.Content data-slot="drawer-content" className={cn(classes)} {...props}>
        <Primitive.Handle
          data-slot="drawer-handle"
          className={cn('mx-auto h-1 w-10 rounded-full bg-muted-foreground/40')}
        />
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
export function DrawerHeader({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="drawer-header" className={cn(`${headerClass} ${className}`)} {...props} />
}
export function DrawerFooter({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="drawer-footer" className={cn(`${footerClass} ${className}`)} {...props} />
}
export function DrawerTitle({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Title>): React.JSX.Element {
  return <Primitive.Title data-slot="drawer-title" className={cn(`${titleClass} ${className}`)} {...props} />
}
export function DrawerDescription({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Description>): React.JSX.Element {
  return (
    <Primitive.Description
      data-slot="drawer-description"
      className={cn(`${helpClass} ${className}`)}
      {...props}
    />
  )
}
