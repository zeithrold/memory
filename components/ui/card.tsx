'use client'

import type { ComponentProps } from 'react'

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ztd-me/ui/card'

export function CardAction({ className = '', ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={
        `col-start-2 row-span-2 row-start-1 self-start justify-self-end ${className}`
      }
      {...props}
    />
  )
}
