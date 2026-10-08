'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { fieldClass, indicatorClass, menuClass, menuItemClass } from './classes.js'
import { cn } from './cn.js'
import { usePortalContainer, useStyleNonce } from './portal.js'

const layout1Class = [
  'shrink-0 opacity-65 transition-transform duration-150 group-data-[state=open]:rotate-180',
  'motion-reduce:transition-none',
].join(' ')

export const SelectRoot = Primitive.Root
export function SelectValue(props: ComponentProps<typeof Primitive.Value>): React.JSX.Element {
  return <Primitive.Value data-slot="select-value" {...props} />
}
export const SelectGroup = Primitive.Group
export function SelectLabel({ className = '', ...props }: ComponentProps<typeof Primitive.Label>): React.JSX.Element {
  return <Primitive.Label className={cn(`px-2 py-1.5 text-help text-muted-foreground ${className}`)} {...props} />
}
export function SelectTrigger({
  className = '',
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>): React.JSX.Element {
  return (
    <Primitive.Trigger
      data-slot="select-trigger"
      className={cn([
        'ztd-select-trigger group inline-flex items-center justify-between gap-2',
        fieldClass,
        className,
      ].join(' '))}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>
        <ChevronDown className={cn(layout1Class)} aria-hidden="true" size={16} />
      </Primitive.Icon>
    </Primitive.Trigger>
  )
}
export type SelectContentProps = ComponentProps<typeof Primitive.Content> & { container?: HTMLElement | null }
export function SelectContent({
  className = '',
  children,
  container,
  position = 'popper',
  sideOffset = 4,
  ...props
}: SelectContentProps): React.JSX.Element {
  const inheritedContainer = usePortalContainer()
  const nonce = useStyleNonce()
  return (
    <Primitive.Portal container={container ?? inheritedContainer}>
      <Primitive.Content
        data-slot="select-content"
        className={cn([
          'ztd-select-content',
          menuClass,
          'z-120 min-w-(--radix-select-trigger-width)',
          'max-h-(--radix-select-content-available-height)',
          className,
        ].join(' '))}
        position={position}
        sideOffset={sideOffset}
        {...props}
      >
        <Primitive.Viewport {...(nonce === undefined ? {} : { nonce })}>{children}</Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
export function SelectItem({
  className = '',
  children,
  ...props
}: ComponentProps<typeof Primitive.Item>): React.JSX.Element {
  return (
    <Primitive.Item
      data-slot="select-item"
      className={cn(`ztd-select-item ${menuItemClass} data-disabled:opacity-50 ${className}`)}
      {...props}
    >
      <Primitive.ItemIndicator
        className={cn(indicatorClass)}
      >
        <Check
          aria-hidden="true"
          size={16}
        />
      </Primitive.ItemIndicator>
      <Primitive.ItemText>{children}</Primitive.ItemText>
    </Primitive.Item>
  )
}
