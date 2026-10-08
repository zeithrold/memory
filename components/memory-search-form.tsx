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

const SEARCHBAR_CLASS = [
  'searchbar flex items-center gap-3 bg-card p-3 border border-border rounded-[12px]',
  'max-[640px]:flex-wrap',
].join(' ')

const SEARCH_INPUT_CLASS = [
  'search-input flex flex-1 items-center gap-2 pl-2 min-w-[90px] text-muted-foreground rounded-md',
  '[&_input]:border-0 [&_input]:shadow-none [&_input]:bg-transparent',
  '[&:focus-within]:[outline:2px_solid_var(--ztd-focus)] [&:focus-within]:[outline-offset:2px]',
  'max-[640px]:basis-full',
].join(' ')

const PROJECT_INPUT_CLASS = [
  'project-input max-w-[150px] max-[640px]:max-w-none max-[640px]:flex-1 max-[640px]:w-20',
].join(' ')

type MemorySearchFormProps = {
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
      className={SEARCHBAR_CLASS}
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
      <div className={SEARCH_INPUT_CLASS}>
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
        className={PROJECT_INPUT_CLASS}
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
