'use client'

import type { ComponentProps, ReactNode } from 'react'
import * as Primitive from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { focusClass } from './classes.js'
import { cn } from './cn.js'

const layout1Class = [
  'shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180',
  'motion-reduce:transition-none',
].join(' ')

export type SettingSectionProps = ComponentProps<typeof Primitive.Root> & {
  title: ReactNode
  description?: ReactNode
  summary?: ReactNode
  status?: ReactNode
}
export function SettingSection({
  title,
  description,
  summary,
  status,
  className = '',
  children,
  ...props
}: SettingSectionProps): React.JSX.Element {
  return (
    <Primitive.Root
      data-slot="setting-section"
      className={cn(`ztd-setting-section border-t border-border py-4 ${className}`)}
      {...props}
    >
      <Primitive.Trigger className={cn([
        'group flex min-h-11 w-full items-center gap-3 rounded-md bg-transparent',
        'text-start',
        focusClass,
      ].join(' '))}
      >
        <span className={cn('grid min-w-0 flex-1 gap-1')}>
          <span className={cn('text-help font-medium text-foreground')}>{title}</span>
          {description === undefined
            ? null
            : (
                <span className={cn('text-help text-muted-foreground')}>{description}</span>
              )}
          {summary === undefined ? null : <span className={cn('text-help text-muted-foreground')}>{summary}</span>}
        </span>
        {status === undefined ? null : <span className={cn('shrink-0 text-help text-muted-foreground')}>{status}</span>}
        <ChevronDown className={cn(layout1Class)} size={16} aria-hidden="true" />
      </Primitive.Trigger>
      <Primitive.Content className={cn('pt-4')}>{children}</Primitive.Content>
    </Primitive.Root>
  )
}
