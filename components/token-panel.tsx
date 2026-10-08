'use client'
import type { Api } from './workspace-shell'
import type { Scope, TokenSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { tokenResponse, tokensResponse } from './api-schemas'
import { perform } from './async-action'
import { CopyButton } from './copy-button'
import { TokenListSkeleton } from './skeletons'
import { TokenCreationForm } from './token-form'
import { TokenList } from './token-list'
import { tokenProject } from './token-project'
import { Button } from './ui/button'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const ERROR_BANNER_CLASS = [
  'error-banner py-4 px-5 bg-[var(--error-background)] text-destructive rounded-md text-control',
  'wrap-anywhere mb-4',
].join(' ')

const SECRET_BOX_CLASS = [
  'secret-box py-4 px-5 border border-border bg-muted mb-6 rounded-md text-control [&_code]:block',
  '[&_code]:wrap-anywhere [&_code]:my-4 [&_code]:mx-0',
].join(' ')

type TokenPanelProps = {
  t: Messages
  api: Api
  ready: boolean
}

type LoadTokensContext = {
  ready: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setTokens: React.Dispatch<React.SetStateAction<TokenSummary[]>>
  api: Api
  setError: React.Dispatch<React.SetStateAction<string>>
  t: Messages
}

async function loadTokens(context: LoadTokensContext): Promise<void> {
  const { ready, setLoading, setTokens, api, setError, t } = context

  if (!ready) {
    return
  }
  setLoading(true)
  try {
    setTokens((await api('tokens', tokensResponse)).tokens)
  }
  catch (err) {
    setError(err instanceof Error ? err.message : t.loadError)
  }
  finally {
    setLoading(false)
  }
}

type CreateTokenContext = {
  scopes: Scope[]
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  api: Api
  setSecret: React.Dispatch<React.SetStateAction<string>>
  load: () => Promise<void>
  t: Messages
}

async function createToken(context: CreateTokenContext, form: HTMLFormElement): Promise<void> {
  const { setBusy, setError, api, setSecret, load, t, scopes } = context

  setBusy(true)
  setError('')
  try {
    const data = new FormData(form)
    const result = await api('tokens', tokenResponse, {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        scopes,
        project: tokenProject(data),
        expiresInDays: Number(data.get('days')),
      }),
    })
    setSecret(result.token)
    form.reset()
    await load()
    toast.success(t.tokenCreated)
  }
  catch (err) {
    toast.error(err instanceof Error ? err.message : t.loadError)
  }
  finally {
    setBusy(false)
  }
}

type TokenPanelContentProps = {
  error: string
  secret: string
  t: Messages
  setSecret: React.Dispatch<React.SetStateAction<string>>
  create: (form: HTMLFormElement) => Promise<void>
  scopes: ('memory:read' | 'memory:write' | 'memory:delete')[]
  setScopes: React.Dispatch<React.SetStateAction<('memory:read' | 'memory:write' | 'memory:delete')[]>>
  ready: boolean
  busy: boolean
  loading: boolean
  tokens: TokenSummary[]
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  api: Api
  load: () => Promise<void>
}

function TokenPanelContent(props: TokenPanelContentProps): React.JSX.Element {
  return (
    <>
      {(props.error.length > 0) && (
        <p
          className={ERROR_BANNER_CLASS}
          role="alert"
        >
          {props.error}
        </p>
      )}
      {(props.secret.length > 0) && (
        <div
          className={SECRET_BOX_CLASS}
          role="status"
        >
          <strong>{props.t.tokenSecret}</strong>
          <code>{props.secret}</code>
          <CopyButton value={props.secret} t={props.t} />
          <Button variant="ghost" onClick={() => props.setSecret('')}>
            {props.t.dismiss}
          </Button>
        </div>
      )}
      <TokenCreationForm
        create={props.create}
        t={props.t}
        scopes={props.scopes}
        setScopes={props.setScopes}
        ready={props.ready}
        busy={props.busy}
      />
      <TokenResults {...props} />
    </>
  )
}

type TokenPanelModel = Pick<
  TokenPanelContentProps,
  'error'
  | 'secret'
  | 'setSecret'
  | 'create'
  | 'scopes'
  | 'setScopes'
  | 'busy'
  | 'loading'
  | 'tokens'
  | 'setBusy'
  | 'load'
>

function useTokenPanelModel(
  {
    t,
    api,
    ready,
  }: TokenPanelProps,
): TokenPanelModel {
  const [tokens, setTokens] = useState<TokenSummary[]>([])

  const [secret, setSecret] = useState('')

  const [error, setError] = useState('')

  const [loading, setLoading] = useState(ready)

  const [busy, setBusy] = useState(false)

  const [scopes, setScopes] = useState<Scope[]>(['memory:read', 'memory:write'])

  const load = useCallback(async () => await loadTokens({ ready, setLoading, setTokens, api, setError, t }), [
    api,
    ready,
    t,
  ])

  useEffect(() => {
    perform(load(), t.loadError)
  }, [load, t.loadError])

  const create = async (
    form: HTMLFormElement,
  ) => await createToken({ setBusy, setError, api, setSecret, load, t, scopes }, form)
  return { error, secret, setSecret, create, scopes, setScopes, busy, loading, tokens, setBusy, load }
}

export function TokenPanel({
  t,
  api,
  ready,
}: TokenPanelProps): React.JSX.Element {
  const model = useTokenPanelModel({ t, api, ready })
  return <TokenPanelContent {...model} t={t} ready={ready} api={api} />
}

function TokenResults(props: TokenPanelContentProps): React.JSX.Element {
  if (props.loading && props.tokens.length === 0) {
    return <TokenListSkeleton />
  }
  if (props.tokens.length === 0) {
    return <p className={MUTED_CLASS}>{props.t.noTokens}</p>
  }
  return (
    <TokenList
      tokens={props.tokens}
      t={props.t}
      busy={props.busy}
      setBusy={props.setBusy}
      api={props.api}
      load={props.load}
    />
  )
}
