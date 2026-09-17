'use client'

import type { Api } from './workspace-shell'
import type { Scope, TokenSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { Copy, KeyRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { TokenListSkeleton } from './skeletons'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

export function TokenPanel({
  t,
  api,
  ready,
}: {
  t: Messages
  api: Api
  ready: boolean
}) {
  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(ready)
  const [busy, setBusy] = useState(false)
  const [scopes, setScopes] = useState<Scope[]>([
    'memory:read',
    'memory:write',
  ])
  const load = useCallback(async () => {
    if (!ready)
      return
    setLoading(true)
    try {
      setTokens((await api<{ tokens: TokenSummary[] }>('tokens')).tokens)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : t.loadError)
    }
    finally {
      setLoading(false)
    }
  }, [api, ready, t.loadError])
  useEffect(() => {
    void load()
  }, [load])
  async function create(form: HTMLFormElement) {
    setBusy(true)
    setError('')
    try {
      const data = new FormData(form)
      const result = await api<{ token: string }>('tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          scopes,
          project: String(data.get('project') ?? '').trim() || null,
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
  return (
    <>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {secret && (
        <div className="secret-box" role="status">
          <strong>{t.tokenSecret}</strong>
          <code>{secret}</code>
          <CopyButton value={secret} t={t} />
          <Button variant="ghost" onClick={() => setSecret('')}>
            {t.dismiss}
          </Button>
        </div>
      )}
      <form
        className="editor"
        onSubmit={(event) => {
          event.preventDefault()
          void create(event.currentTarget)
        }}
      >
        <div className="form-grid">
          <div className="field">
            <Label htmlFor="token-name">{t.tokenName}</Label>
            <Input
              id="token-name"
              name="name"
              required
              maxLength={80}
              placeholder="Codex · Mac"
            />
          </div>
          <div className="field">
            <Label htmlFor="token-project">{t.tokenProject}</Label>
            <Input
              id="token-project"
              name="project"
              maxLength={64}
              pattern="[A-Za-z0-9_.-]+"
            />
          </div>
          <div className="field">
            <Label htmlFor="token-days">{t.days}</Label>
            <Input
              id="token-days"
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={90}
              required
            />
          </div>
        </div>
        <fieldset className="scope-choices">
          <legend>{t.tokenScope}</legend>
          {(
            [
              { value: 'memory:read', label: t.read },
              { value: 'memory:write', label: t.write },
              { value: 'memory:delete', label: t.deletePermission },
            ] as const
          ).map(({ value, label }) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={scopes.includes(value)}
                onChange={event =>
                  setScopes(
                    event.target.checked
                      ? [...scopes, value]
                      : scopes.filter(scope => scope !== value),
                  )}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <Button disabled={!ready || busy || scopes.length === 0}>
            <KeyRound size={16} />
            {t.createToken}
          </Button>
        </div>
      </form>
      {loading && tokens.length === 0
        ? (
            <TokenListSkeleton />
          )
        : tokens.length === 0
          ? (
              <p className="muted">{t.noTokens}</p>
            )
          : (
              <div className="token-list">
                {tokens.map(token => (
                  <div key={token.id} className="token-row">
                    <div>
                      <strong>{token.name}</strong>
                      <p>
                        <code>
                          {token.prefix}
                          …
                        </code>
                        {' '}
                        ·
                        {token.project ?? '*'}
                        {' '}
                        ·
                        {' '}
                        {token.scopes.join(', ')}
                      </p>
                      <small>
                        {t.expires}
                        :
                        {token.expires_at.slice(0, 10)}
                        {' '}
                        ·
                        {t.lastUsed}
                        :
                        {' '}
                        {token.last_used_at?.slice(0, 10) ?? t.never}
                      </small>
                    </div>
                    {token.revoked_at !== null
                      ? (
                          <Badge variant="outline">{t.revoked}</Badge>
                        )
                      : (
                          <ConfirmAction
                            label={t.revoke}
                            description={t.revokeConfirm}
                            cancel={t.cancel}
                            disabled={busy}
                            onConfirm={() => {
                              setBusy(true)
                              void api(`tokens/${token.id}`, { method: 'DELETE' })
                                .then(load)
                                .then(() => toast.success(t.tokenRevoked))
                                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : t.loadError))
                                .finally(() => setBusy(false))
                            }}
                          />
                        )}
                  </div>
                ))}
              </div>
            )}
    </>
  )
}
function CopyButton({ value, t }: { value: string, t: Messages }) {
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
