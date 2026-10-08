'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn.js'

const layout1Class = [
  'ztd-accordion-trigger group flex min-h-11 w-full items-center justify-between gap-3 border-0',
  'bg-transparent py-4 text-start font-sans text-control text-foreground',
].join(' ')

const layout2Class = [
  'ztd-disclosure-icon shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180',
  'motion-reduce:transition-none',
].join(' ')

export const Accordion = Primitive.Root
export function AccordionItem({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Item>): React.JSX.Element {
  return (
    <Primitive.Item
      data-slot="accordion-item"
      className={cn(`ztd-accordion-item border-b border-border ${className}`)}
      {...props}
    />
  )
}
export function AccordionTrigger({
  className = '',
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>): React.JSX.Element {
  return (
    <Primitive.Header data-slot="accordion-header" className={cn('ztd-accordion-header m-0')}>
      <Primitive.Trigger className={cn(`${layout1Class} ${className}`)} {...props}>
        {children}
        <ChevronDown className={cn(layout2Class)} aria-hidden="true" size={18} />
      </Primitive.Trigger>
    </Primitive.Header>
  )
}
export function AccordionContent({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Content>): React.JSX.Element {
  return (
    <Primitive.Content
      data-slot="accordion-content"
      className={cn(`ztd-accordion-content overflow-hidden pb-4 ${className}`)}
      {...props}
    />
  )
}
