'use client'

import type { ComponentProps } from 'react'
import { SelectTrigger as SharedSelectTrigger } from './ztd-me/ui/select'

export {
  SelectRoot as Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectValue,
} from './ztd-me/ui/select'

export function SelectTrigger({
  size = 'default',
  ...props
}: ComponentProps<typeof SharedSelectTrigger> & { size?: 'sm' | 'default' }): React.JSX.Element {
  return <SharedSelectTrigger data-slot="select-trigger" data-size={size} {...props} />
}
