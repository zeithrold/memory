'use client'
import type { MemoryInput } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { memoryInputSchema } from '@/lib/contracts'

import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select as NativeSelect } from './ui/ztd-me/ui/fields'

const FORM_GRID_CLASS = [
  'form-grid grid grid-cols-[repeat(auto-fit,_minmax(180px,_1fr))] gap-4',
  'max-[640px]:grid-cols-[minmax(0,_1fr)]',
].join(' ')

type MemoryBasicFieldsProps = {
  t: Messages
  input: MemoryInput
  setInput: React.Dispatch<React.SetStateAction<MemoryInput>>
}

export function MemoryBasicFields(
  { t, input, setInput }: MemoryBasicFieldsProps,
): React.JSX.Element {
  return (
    <div className={FORM_GRID_CLASS}>
      <div className="field grid gap-2 mb-5">
        <Label htmlFor="memory-title">{t.title}</Label>
        <Input
          id="memory-title"
          required
          maxLength={160}
          value={input.title}
          onChange={event =>
            setInput({ ...input, title: event.target.value })}
        />
      </div>
      <div className="field grid gap-2 mb-5">
        <Label htmlFor="memory-kind">{t.kind}</Label>
        <NativeSelect
          id="memory-kind"
          value={input.kind}
          onChange={event =>
            setInput({
              ...input,
              kind: memoryInputSchema.shape.kind.parse(event.target.value),
            })}
        >
          {([
            'preference',
            'fact',
            'decision',
            'experience',
          ] as const).map(
            kind => (
              <option key={kind} value={kind}>
                {t[kind]}
              </option>
            ),
          )}
        </NativeSelect>
      </div>
    </div>
  )
}

type MemoryTextFieldsProps = {
  t: Messages
  input: MemoryInput
  setInput: React.Dispatch<React.SetStateAction<MemoryInput>>
}

export function MemoryTextFields(
  { t, input, setInput }: MemoryTextFieldsProps,
): React.JSX.Element {
  return (
    <div className="field grid gap-2 mb-5">
      <Label htmlFor="memory-content">{t.content}</Label>
      <Textarea
        id="memory-content"
        required
        maxLength={6000}
        rows={5}
        value={input.content}
        onChange={event =>
          setInput({ ...input, content: event.target.value })}
      />
    </div>
  )
}

type MemoryEvidenceFieldsProps = {
  t: Messages
  input: MemoryInput
  setInput: React.Dispatch<React.SetStateAction<MemoryInput>>
}

export function MemoryEvidenceFields(
  { t, input, setInput }: MemoryEvidenceFieldsProps,
): React.JSX.Element {
  return (
    <div className="field grid gap-2 mb-5">
      <Label htmlFor="memory-source">{t.source}</Label>
      <Input
        id="memory-source"
        required
        maxLength={1000}
        placeholder={t.sourceHint}
        value={input.source}
        onChange={event =>
          setInput({ ...input, source: event.target.value })}
      />
    </div>
  )
}
