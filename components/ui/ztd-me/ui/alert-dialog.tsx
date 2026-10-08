'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-alert-dialog'
import { cn } from './cn.js'
import { usePortalContainer } from './portal.js'

const layout1Class = [
  'ztd-dialog ztd-overlay fixed top-1/2 left-1/2 z-111 grid max-h-[calc(100dvh-32px)]',
  'w-[min(560px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 content-start gap-6 overflow-y-auto',
  'rounded-xl border border-border bg-surface p-6 font-sans text-body text-foreground',
].join(' ')

export const AlertDialog = Primitive.Root
export const AlertDialogTrigger = Primitive.Trigger
export const AlertDialogAction = Primitive.Action
export const AlertDialogCancel = Primitive.Cancel
export type AlertDialogContentProps = ComponentProps<typeof Primitive.Content> & {
  container?: HTMLElement | null
}
export function AlertDialogContent({
  className = '',
  children,
  container,
  ...props
}: AlertDialogContentProps): React.JSX.Element {
  const inheritedContainer = usePortalContainer()
  return (
    <Primitive.Portal container={container ?? inheritedContainer}>
      <Primitive.Overlay
        data-slot="modal-overlay"
        className={cn('ztd-modal-overlay fixed inset-0 z-110 bg-backdrop')}
      />
      <Primitive.Content
        data-slot="alert-dialog-content"
        className={cn(`${layout1Class} ${className}`)}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
export function AlertDialogHeader({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="dialog-header" className={cn(`ztd-dialog-header grid gap-2 ${className}`)} {...props} />
}
export function AlertDialogFooter({
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
export function AlertDialogTitle({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Title>): React.JSX.Element {
  return (
    <Primitive.Title
      data-slot="dialog"
      className={cn(`ztd-dialog-title m-0 text-heading leading-[1.35] font-semibold ${className}`)}
      {...props}
    />
  )
}
export function AlertDialogDescription({
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
