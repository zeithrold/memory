'use client'
import type { Messages } from '@/lib/i18n/messages'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from './ui/button'

interface CopyButtonProps { value: string, t: Messages }

export function CopyButton({ value, t }: CopyButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => toast.error(t.copyFailed))
      }}
    >
      <Copy size={14} />
      {copied ? t.copied : t.copy}
    </Button>
  )
}
