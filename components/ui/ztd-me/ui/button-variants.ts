import type { ButtonProps } from './button.js'
import { disabledClass, focusClass } from './classes.js'
import { cn } from './cn.js'

const variants = {
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  link: 'border-transparent bg-transparent text-primary underline-offset-4 hover:underline',
  default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/88',
  outline: 'border-border bg-surface text-foreground hover:bg-muted data-[state=open]:bg-muted',
  ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted data-[state=open]:bg-muted',
  destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/88',
}
const sizes = {
  'xs': 'min-h-8 px-2 py-1 pointer-coarse:min-h-11',
  'lg': 'min-h-12 px-4 py-3',
  'icon-xs': 'size-8 p-1 pointer-coarse:size-11',
  'icon-sm': 'size-9 p-1.5 pointer-coarse:size-11',
  'icon-lg': 'size-12 p-3',
  'default': 'min-h-11 px-3 py-2',
  'sm': 'min-h-9 px-2.5 py-1.5 pointer-coarse:min-h-11',
  'icon': 'size-11 p-2',
}
export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'className'> = {}): string {
  return cn(
    'ztd-control ztd-button inline-flex min-w-11 shrink-0 items-center justify-center gap-2',
    'rounded-lg border font-sans text-control whitespace-nowrap transition-colors duration-150',
    'cursor-pointer motion-reduce:transition-none aria-invalid:border-destructive',
    focusClass,
    disabledClass,
    variants[variant],
    sizes[size],
    className,
  )
}
