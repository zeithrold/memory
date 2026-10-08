'use client'
import type { Memory, MemoryInput } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { useState } from 'react'

import { MemoryBasicFields, MemoryEvidenceFields, MemoryTextFields } from './memory-editor-fields'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

const EDITOR_CLASS = ['editor border border-border rounded-[12px] bg-card p-6 mb-6'].join(' ')

const SECTION_HEADING_CLASS = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

type MemoryEditorProps = {
  t: Messages
  memory: Memory | 'new'
  project: string
  busy: boolean
  onCancel: () => void
  onSave: (input: MemoryInput) => void
}

type MemoryEditorFormProps = {
  onSave: (input: MemoryInput) => void
  input: MemoryInput
  tags: string
  memory: Memory | 'new'
  t: Messages
  setInput: React.Dispatch<React.SetStateAction<MemoryInput>>
  setTags: React.Dispatch<React.SetStateAction<string>>
  busy: boolean
  onCancel: () => void
}

function MemoryEditorForm(props: MemoryEditorFormProps): React.JSX.Element {
  return (
    <form
      className={EDITOR_CLASS}
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave({
          project: props.input.project,
          title: props.input.title,
          content: props.input.content,
          kind: props.input.kind,
          source: props.input.source,
          tags: [
            ...new Set(
              props.tags
                .split(/[,，]/)
                .map(tag => tag.trim())
                .filter(Boolean),
            ),
          ],
        })
      }}
    >
      <div className={SECTION_HEADING_CLASS}>
        <h2>{props.memory === 'new' ? props.t.newMemory : props.t.edit}</h2>
        <Badge variant="outline">{props.input.project}</Badge>
      </div>
      <MemoryBasicFields t={props.t} input={props.input} setInput={props.setInput} />
      <MemoryTextFields t={props.t} input={props.input} setInput={props.setInput} />
      <div className="field grid gap-2 mb-5">
        <Label htmlFor="memory-tags">{props.t.tags}</Label>
        <Input
          id="memory-tags"
          value={props.tags}
          onChange={event => props.setTags(event.target.value)}
        />
      </div>
      <MemoryEvidenceFields t={props.t} input={props.input} setInput={props.setInput} />
      <div className="form-actions flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          {props.t.cancel}
        </Button>
        <Button disabled={props.busy}>{props.t.save}</Button>
      </div>
    </form>
  )
}

export function MemoryEditor({
  t,
  memory,
  project,
  busy,
  onCancel,
  onSave,
}: MemoryEditorProps): React.JSX.Element {
  const initial
    = memory === 'new'
      ? {
          title: '',
          content: '',
          kind: 'fact' as const,
          tags: [],
          source: '',
          project,
        }
      : memory
  const [input, setInput] = useState<MemoryInput>(initial)
  const [tags, setTags] = useState(initial.tags.join(', '))
  return (
    <MemoryEditorForm
      onSave={onSave}
      input={input}
      tags={tags}
      memory={memory}
      t={t}
      setInput={setInput}
      setTags={setTags}
      busy={busy}
      onCancel={onCancel}
    />
  )
}
