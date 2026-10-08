'use client'

import type { ComponentProps } from 'react'
import { Button } from './button'
import {
  AlertDialogAction as SharedAction,
  AlertDialogCancel as SharedCancel,
} from './ztd-me/ui/alert-dialog'

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ztd-me/ui/alert-dialog'

export function AlertDialogAction(props: ComponentProps<typeof SharedAction>): React.JSX.Element {
  return <SharedAction asChild><Button {...props} /></SharedAction>
}
export function AlertDialogCancel(props: ComponentProps<typeof SharedCancel>): React.JSX.Element {
  return <SharedCancel asChild><Button variant="outline" {...props} /></SharedCancel>
}
