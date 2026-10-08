'use client'

import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-tabs'
import { cn } from './cn.js'

const layout1Class = [
  'ztd-tabs-trigger inline-flex items-center justify-center gap-2 min-h-10 rounded-md border-0',
  'bg-transparent px-3 py-2 font-sans text-control',
  'text-muted-foreground pointer-coarse:min-h-11 data-[state=active]:bg-surface',
  'data-[state=active]:text-foreground',
].join(' ')

export const Tabs = Primitive.Root
export function TabsList({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.List>): React.JSX.Element {
  return (
    <Primitive.List
      data-slot="tabs-list"
      className={cn(`ztd-tabs-list inline-flex flex-wrap gap-1 rounded-[10px] bg-muted p-1 ${className}`)}
      {...props}
    />
  )
}
export function TabsTrigger({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Trigger>): React.JSX.Element {
  return <Primitive.Trigger data-slot="tabs-trigger" className={cn(`${layout1Class} ${className}`)} {...props} />
}
export function TabsContent({
  className = '',
  ...props
}: ComponentProps<typeof Primitive.Content>): React.JSX.Element {
  return (
    <Primitive.Content
      data-slot="tabs-content"
      className={cn(`ztd-tabs-content mt-4 ${className}`)}
      {...props}
    />
  )
}
