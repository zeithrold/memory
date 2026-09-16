'use client'

import type { Api } from './dashboard'
import type { Scope, TokenSummary, UsageSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { Copy, KeyRound } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { ConfirmAction } from './confirm-action'
import { TokenListSkeleton, UsageSkeleton } from './skeletons'
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
export function UsagePanel({
  t,
  api,
  ready,
}: {
  t: Messages
  api: Api
  ready: boolean
}) {
  const [usage, setUsage] = useState<UsageSummary[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(ready)
  useEffect(() => {
    if (!ready)
      return
    let active = true
    void Promise.all([
      api<{ usage: UsageSummary[] }>('usage'),
      api<{ index: { pending: number } }>('status'),
    ])
      .then(([result, status]) => {
        if (active) {
          setUsage(result.usage)
          setPending(status.index.pending)
        }
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : t.loadError)
      })
      .finally(() => {
        if (active)
          setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, ready, t.loadError])
  const total = usage.reduce((sum, row) => sum + row.calls, 0)
  const errors = usage.reduce((sum, row) => sum + row.errors, 0)
  return (
    <>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading
        ? (
            <UsageSkeleton />
          )
        : (
            <>
              <div className="stats">
                <div>
                  <span>{t.calls}</span>
                  <strong>{total}</strong>
                </div>
                <div>
                  <span>{t.errors}</span>
                  <strong>{errors}</strong>
                </div>
                <div>
                  <span>{t.pending}</span>
                  <strong>{pending}</strong>
                </div>
              </div>
              <p className="muted">{t.usageNote}</p>
              {usage.length === 0
                ? (
                    <div className="empty-state">
                      <h2>{t.noUsage}</h2>
                    </div>
                  )
                : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t.day}</th>
                            <th>{t.tokenName}</th>
                            <th>{t.operation}</th>
                            <th>{t.calls}</th>
                            <th>{t.errors}</th>
                            <th>{t.latency}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usage.map(row => (
                            <tr key={`${row.day}:${row.token_id}:${row.client_id}:${row.operation}`}>
                              <td>{row.day}</td>
                              <td>{connectionLabel(row, t)}</td>
                              <td>
                                <code>{row.operation}</code>
                              </td>
                              <td>{row.calls}</td>
                              <td>{row.errors}</td>
                              <td>
                                {row.average_ms}
                                {' '}
                                ms
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
            </>
          )}
    </>
  )
}
/** Personal tokens carry a name; OAuth connections are identified by their client. */
function connectionLabel(row: UsageSummary, t: Messages): string {
  if (row.token_name !== null && row.token_name.length > 0)
    return row.token_name
  if (row.client_id !== null && row.client_id.length > 0) {
    // CIMD clients are URLs; DCR and pre-registered clients use opaque identifiers.
    try {
      return `${t.oauthClient} · ${new URL(row.client_id).host}`
    }
    catch {
      return `${t.oauthClient} · ${row.client_id.slice(0, 8)}`
    }
  }
  if (row.token_id !== null && row.token_id.length > 0)
    return row.token_id.slice(0, 8)
  return t.webSession
}
export function ConnectPanel({ t }: { t: Messages }) {
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => 'https://your-memory.example')
  const codex = `[mcp_servers.shared_memory]\nurl = "${origin}/mcp"\nbearer_token_env_var = "MEMORY_API_TOKEN"`
  const cursor = JSON.stringify(
    {
      mcpServers: {
        shared_memory: {
          url: `${origin}/mcp`,
          headers: { Authorization: `Bearer $${'{env:MEMORY_API_TOKEN}'}` },
        },
      },
    },
    null,
    2,
  )
  return (
    <div className="connect-grid">
      <section className="connection-card">
        <h2>{t.endpoint}</h2>
        <code>
          {origin}
          /mcp
        </code>
        <p>{t.tokenSafety}</p>
      </section>
      <section className="connection-card">
        <div className="section-heading">
          <h2>{t.chatgpt}</h2>
          <CopyButton value={`${origin}/mcp`} t={t} />
        </div>
        <p>{t.chatgptBody}</p>
        <code>
          {origin}
          /mcp
        </code>
      </section>
      {[
        { name: 'Codex', text: codex },
        { name: 'Cursor', text: cursor },
      ].map(item => (
        <section key={item.name} className="connection-card">
          <div className="section-heading">
            <h2>{item.name}</h2>
            <CopyButton value={item.text} t={t} />
          </div>
          <pre>{item.text}</pre>
        </section>
      ))}
      <section className="connection-card">
        <h2>{t.skill}</h2>
        <p>{t.skillBody}</p>
      </section>
      <section className="connection-card">
        <h2>{t.plugin}</h2>
        <p>{t.pluginBody}</p>
        <code>pnpm plugin:build</code>
      </section>
      <section className="connection-card">
        <h2>{t.deepseek}</h2>
        <p>{t.deepseekBody}</p>
        <code>
          POST
          {origin}
          /api/v1/search
        </code>
      </section>
    </div>
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

function subscribeOrigin(): () => void {
  return () => undefined
}
