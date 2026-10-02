'use client'
import type { Api } from './api-client'
import type { Memory } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { Search } from 'lucide-react'
import {
  memorySearchResponse,
} from './api-schemas'
import { perform } from './async-action'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface MemorySearchFormProps {
  run: (action: () => Promise<void>) => Promise<void>
  query: string
  load: () => Promise<void>
  api: Api
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>
  setSearchMode: React.Dispatch<React.SetStateAction<string>>
  t: Messages
  setQuery: React.Dispatch<React.SetStateAction<string>>
  project: string
  setProject: React.Dispatch<React.SetStateAction<string>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
  busy: boolean
  authState: 'ready' | 'unconfigured'
}

export function MemorySearchForm(
  props: MemorySearchFormProps,
): React.JSX.Element {
  return (
    <form
      className="searchbar"
      onSubmit={(
        event,
      ) => {
        event.preventDefault()
        perform(

          props.run(

            async () => {
              if (!(props.query.trim().length > 0)) {
                await props.load()
                return
              }
              const result = await props.api(

                'search',

                memorySearchResponse,

                { method: 'POST', body: JSON.stringify({ query: props.query, project: props.project }) },

              )
              props.setMemories(result.memories)
              props.setSearchMode(result.mode)
            },

          ),

          props.t.loadError,
        )
      }}
    >
      <div className="search-input">
        <Search size={18} />
        <Input
          aria-label={props.t.search}
          placeholder={props.t.searchHint}
          value={props.query}
          onChange={event => props.setQuery(event.target.value)}
          maxLength={300}
        />
      </div>
      <Input
        className="project-input"
        aria-label={props.t.project}
        value={props.project}
        onChange={(event) => {
          props.setProject(event.target.value)
          props.setOffset(0)
        }}
        maxLength={64}
      />
      <Button
        variant="secondary"
        disabled={props.busy || props.authState !== 'ready'}
      >
        {props.t.search}
      </Button>
    </form>
  )
}
