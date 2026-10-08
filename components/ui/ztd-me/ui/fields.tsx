'use client'

import type { ComponentProps } from 'react'
import * as Slot from '@radix-ui/react-slot'
import { fieldClass, helpClass } from './classes.js'
import { cn } from './cn.js'

export function Input({ className = '', ...props }: ComponentProps<'input'>): React.JSX.Element {
  return <input data-slot="input" className={cn(`ztd-input ${fieldClass} ${className}`)} {...props} />
}
export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>): React.JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(`ztd-textarea min-h-25 resize-y ${fieldClass} ${className}`)}
      {...props}
    />
  )
}
export function Label({ className = '', ...props }: ComponentProps<'label'>): React.JSX.Element {
  return (
    <label
      data-slot="label"
      className={cn(`ztd-label block font-sans text-help font-medium text-muted-foreground ${className}`)}
      {...props}
    />
  )
}
export function Select({ className = '', ...props }: ComponentProps<'select'>): React.JSX.Element {
  return <select data-slot="select" className={cn(`ztd-select ${fieldClass} ${className}`)} {...props} />
}
export type BadgeProps = ComponentProps<'span'> & {
  asChild?: boolean
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'
}
const variants = {
  default: 'border-transparent bg-primary text-primary-foreground',
  success: 'border-transparent bg-success/10 text-success',
  warning: 'border-transparent bg-warning/10 text-warning',
  info: 'border-transparent bg-info/10 text-info',
  secondary: 'border-transparent bg-muted text-muted-foreground',
  outline: 'border-border bg-transparent text-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
}
export function Badge({
  asChild = false,
  className = '',
  variant = 'default',
  ...props
}: BadgeProps): React.JSX.Element {
  const classes = [
    'ztd-badge inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
    'font-sans text-help leading-5 whitespace-nowrap',
    variants[variant],
    className,
  ].join(' ')
  const Component = asChild ? Slot.Root : 'span'
  return <Component data-slot="badge" className={cn(classes)} data-variant={variant} {...props} />
}
export function Field({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="field" className={cn(`ztd-field grid min-w-0 gap-2 ${className}`)} {...props} />
}
export function FieldGroup({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="field-group" className={cn(`ztd-field-group grid gap-6 ${className}`)} {...props} />
}
export function FieldDescription({ className = '', ...props }: ComponentProps<'p'>): React.JSX.Element {
  return <p className={cn(`${helpClass} ${className}`)} {...props} />
}
