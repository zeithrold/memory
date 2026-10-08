'use client'

import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { indicatorClass, menuItemClass } from './classes.js'
import { cn } from './cn.js'

export function MenuChoice({ value, children }: { value: string, children: ReactNode }): React.JSX.Element {
  return (
    <DropdownMenu.RadioItem value={value} className={cn(menuItemClass)}>
      <DropdownMenu.ItemIndicator className={cn(indicatorClass)}>
        <Check size={16} aria-hidden="true" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  )
}
