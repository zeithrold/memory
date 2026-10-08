'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import { cn } from './cn.js'
import { usePortalContainer } from './portal.js'

const layout1Class = [
  'ztd-sheet ztd-overlay fixed z-111 grid max-h-dvh content-start gap-6 overflow-y-auto border',
  'border-border bg-surface p-6 font-sans text-body text-foreground data-[side=right]:inset-y-0',
  'data-[side=right]:right-0 data-[side=right]:w-[min(440px,90vw)] data-[side=left]:inset-y-0',
  'data-[side=left]:left-0 data-[side=left]:w-[min(440px,90vw)] data-[side=top]:inset-x-0',
  'data-[side=top]:top-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0',
].join(' ')

export const Sheet = Primitive.Root
export const SheetTrigger = Primitive.Trigger
export const SheetClose = Primitive.Close
export type SheetContentProps = ComponentProps<typeof Primitive.Content> & {
  container?: HTMLElement | null
  side?: 'top' | 'right' | 'bottom' | 'left'
}
export function SheetContent({
  className = '',
  children,
  container,
  side = 'right',
  ...props
}: SheetContentProps): React.JSX.Element {
  const inheritedContainer = usePortalContainer()
  return (
    <Primitive.Portal container={container ?? inheritedContainer}>
      <Primitive.Overlay
        data-slot="modal-overlay"
        className={cn('ztd-modal-overlay fixed inset-0 z-110 bg-backdrop')}
      />
      <Primitive.Content
        data-slot="sheet-content"
        className={cn(`${layout1Class} ${className}`)}
        data-side={side}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
export function SheetHeader({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="dialog-header" className={cn(`ztd-dialog-header grid gap-2 ${className}`)} {...props} />
}
export function SheetFooter({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(`ztd-dialog-footer flex flex-wrap items-center justify-end gap-3 ${className}`)}
      {...props}
    />
  )
}
export function SheetTitle({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Title>): React.JSX.Element {
  return (
    <Primitive.Title
      data-slot="dialog-title"
      className={cn(`ztd-dialog-title m-0 text-heading leading-[1.35] font-semibold ${className}`)}
      {...props}
    />
  )
}
export function SheetDescription({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Description>): React.JSX.Element {
  return (
    <Primitive.Description
      data-slot="help"
      className={cn(`ztd-help m-0 font-sans text-help text-muted-foreground ${className}`)}
      {...props}
    />
  )
}
