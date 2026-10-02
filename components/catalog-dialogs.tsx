'use client'
import type { Messages } from '@/lib/i18n/messages'

import { perform } from './async-action'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

export function RunStartDialog(
  props: RunStartDialogProps,
): React.JSX.Element {
  return (
    <Dialog
      open={props.runDialog !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.setRunDialog(null)
        }
      }}
    >
      <DialogContent closeLabel={props.t.close}>
        <DialogHeader>
          <DialogTitle>{props.t.runPromptTitle}</DialogTitle>
          <DialogDescription>{props.t.runPromptHint}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="catalog-run-prompt">{props.t.runPromptTitle}</Label>
          <Textarea
            id="catalog-run-prompt"
            value={props.runPrompt}
            placeholder={props.t.runPromptPlaceholder}
            onChange={event => props.setRunPrompt(event.target.value)}
            maxLength={2000}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.setRunDialog(null)}>{props.t.cancel}</Button>
          <Button
            disabled={props.busy || !props.configured}
            onClick={() => perform(props.confirmStartRun(), props.t.loadError)}
          >
            {props.runDialog?.dryRun === true ? props.t.dryRun : props.t.startRun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProposalAdviceDialog(
  props: ProposalAdviceDialogProps,
): React.JSX.Element {
  return (
    <Dialog open={props.adviceDialog} onOpenChange={props.setAdviceDialog}>
      <DialogContent closeLabel={props.t.close}>
        <DialogHeader>
          <DialogTitle>{props.t.rejectWithAdvice}</DialogTitle>
          <DialogDescription>{props.t.adviceLabel}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={props.adviceText}
          placeholder={props.t.advicePlaceholder}
          onChange={event => props.setAdviceText(event.target.value)}
          maxLength={2000}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.setAdviceDialog(false)}>{props.t.cancel}</Button>
          <Button
            disabled={props.busy || props.adviceText.trim().length === 0}
            onClick={() => perform(props.decideBulk('reject', props.adviceText), props.t.loadError)}
          >
            {props.t.rejectWithAdvice}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RunStartDialogProps {
  runDialog: { dryRun: boolean } | null
  setRunDialog: React.Dispatch<React.SetStateAction<{ dryRun: boolean } | null>>
  t: Messages
  runPrompt: string
  setRunPrompt: React.Dispatch<React.SetStateAction<string>>
  busy: boolean
  configured: boolean
  confirmStartRun: () => Promise<void>
}

interface ProposalAdviceDialogProps {
  adviceDialog: boolean
  setAdviceDialog: React.Dispatch<React.SetStateAction<boolean>>
  t: Messages
  adviceText: string
  setAdviceText: React.Dispatch<React.SetStateAction<string>>
  busy: boolean
  decideBulk: (decision: 'approve' | 'reject', advice?: string) => Promise<void>
}
