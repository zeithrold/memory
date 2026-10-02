'use client'
import type { Api } from './workspace-shell'
import type { TokenSummary } from '@/lib/contracts'
import type { Messages } from '@/lib/i18n/messages'
import { toast } from 'sonner'
import { ignoredResponse } from './api-schemas'
import { ConfirmAction } from './confirm-action'
import { Badge } from './ui/badge'

interface TokenListProps {
  tokens: TokenSummary[]
  t: Messages
  busy: boolean
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  api: Api
  load: () => Promise<void>
}

interface TokenRowProps {
  token: TokenSummary
  t: Messages
  busy: boolean
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  api: Api
  load: () => Promise<void>
}

function TokenRow({ token, t, busy, setBusy, api, load }: TokenRowProps): React.JSX.Element {
  return (
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
          {token.scopes.join(', ',

          )}
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
                void api(`tokens/${token.id}`, ignoredResponse, { method: 'DELETE' })
                  .then(load)
                  .then(() => toast.success(t.tokenRevoked))
                  .catch(

                    (err: unknown) => toast.error(err instanceof Error ? err.message : t.loadError),

                  )

                  .finally(

                    () => setBusy(false),

                  )
              }}
            />
          )}
    </div>
  )
}
export function TokenList(
  { tokens, t, busy, setBusy, api, load }: TokenListProps,
): React.JSX.Element {
  return (
    <div className="token-list">
      {tokens.map(
        token => (
          <TokenRow key={token.id} token={token} t={t} busy={busy} setBusy={setBusy} api={api} load={load} />
        ),
      )}
    </div>
  )
}
