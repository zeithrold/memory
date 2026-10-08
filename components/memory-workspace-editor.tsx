'use client'
import type { Api } from './api-client'
import type { Memory } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { toast } from 'sonner'
import {
  ignoredResponse,
} from './api-schemas'
import { perform } from './async-action'
import { MemoryEditor } from './memory-editor'

type WorkspaceMemoryEditorProps = {
  editing: Memory | 'new'
  t: Messages
  project: string
  busy: boolean
  setEditing: React.Dispatch<React.SetStateAction<Memory | 'new' | null>>
  run: (action: () => Promise<void>) => Promise<void>
  api: Api
  load: () => Promise<void>
}

export function WorkspaceMemoryEditor(props: WorkspaceMemoryEditorProps): React.JSX.Element {
  return (
    <MemoryEditor
      key={props.editing === 'new' ? 'new' : props.editing.id}
      t={props.t}
      memory={props.editing}
      project={props.project}
      busy={props.busy}
      onCancel={() => props.setEditing(null)}
      onSave={input =>
        perform(props.run(async () => {
          const data
            = props.editing === 'new'
              ? { ...input, idempotencyKey: crypto.randomUUID() }
              : { ...input, expectedVersion: props.editing.version }
          await props.api(
            props.editing === 'new' ? 'memories' : `memories/${props.editing.id}`,
            ignoredResponse,
            {
              method: props.editing === 'new' ? 'POST' : 'PATCH',
              body: JSON.stringify(data),
            },
          )
          props.setEditing(null)
          await props.load()
          toast.success(props.t.saved)
        }), props.t.loadError)}
    />
  )
}
