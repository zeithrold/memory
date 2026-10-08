'use client'

import type { ComponentProps } from 'react'
import { cn } from './cn.js'

const layout1Class = [
  'ztd-card min-w-0 rounded-xl border border-border bg-surface font-sans text-body text-foreground',
].join(' ')

export function Card({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card" className={cn(`${layout1Class} ${className}`)} {...props} />
}
export function CardHeader({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn('ztd-card-header grid gap-2 p-6', 'has-[[data-slot=card-action]]:grid-cols-[1fr_auto]', className)}
      {...props}
    />
  )
}
export function CardTitle({
  className = '',
  ...props
}: ComponentProps<'h2'>): React.JSX.Element {
  return (
    <h2
      data-slot="card-title"
      className={cn(`ztd-card-title m-0 text-heading leading-[1.35] font-semibold ${className}`)}
      {...props}
    />
  )
}
export function CardDescription({
  className = '',
  ...props
}: ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="card-description"
      className={cn(`ztd-help m-0 font-sans text-help text-muted-foreground ${className}`)}
      {...props}
    />
  )
}
export function CardContent({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-content" className={cn(`ztd-card-content px-6 pb-6 ${className}`)} {...props} />
}
export function CardFooter({
  className = '',
  ...props
}: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn(`ztd-card-footer flex flex-wrap items-center justify-end gap-3 px-6 pb-6 ${className}`)}
      {...props}
    />
  )
}

export function CardAction({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start', className)}
      {...props}
    />
  )
}
