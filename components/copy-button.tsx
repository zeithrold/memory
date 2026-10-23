'use client'
import type { Messages } from '@/lib/i18n/messages'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from './ui/button'

type CopyButtonProps = { value: string, t: Messages }

export function CopyButton({ value, t }: CopyButtonProps): React.JSX.Element {
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const copied = copiedValue === value
  const copy = async (): Promise<void> => {
    setCopiedValue(null)
    await navigator.clipboard.writeText(value)
    setCopiedValue(value)
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        copy().catch(() => toast.error(t.copyFailed))
      }}
    >
      <Copy size={14} aria-hidden="true" />
      {copied ? t.copied : t.copy}
    </Button>
  )
}
