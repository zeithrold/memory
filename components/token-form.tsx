'use client'
import type { Messages } from '@/lib/i18n/messages'
import { KeyRound } from 'lucide-react'
import { perform } from './async-action'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface TokenFormFieldsProps {
  t: Messages
}

function TokenFormFields({ t }: TokenFormFieldsProps): React.JSX.Element {
  return (
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
  )
}

interface TokenScopeChoicesProps {
  t: Messages
  scopes: ('memory:read' | 'memory:write' | 'memory:delete')[]
  setScopes: React.Dispatch<React.SetStateAction<('memory:read' | 'memory:write' | 'memory:delete')[]>>
}

function TokenScopeChoices(
  { t, scopes, setScopes }: TokenScopeChoicesProps,
): React.JSX.Element {
  return (
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
                  ? [
                      ...scopes,
                      value,
                    ]
                  : scopes.filter(scope => scope !== value),
              )}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

interface TokenCreationFormProps {
  create: (form: HTMLFormElement) => Promise<void>
  t: Messages
  scopes: ('memory:read' | 'memory:write' | 'memory:delete')[]
  setScopes: React.Dispatch<React.SetStateAction<('memory:read' | 'memory:write' | 'memory:delete')[]>>
  ready: boolean
  busy: boolean
}

export function TokenCreationForm(
  { create, t, scopes, setScopes, ready, busy }: TokenCreationFormProps,
): React.JSX.Element {
  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault()
        perform(create(event.currentTarget), t.loadError)
      }}
    >
      <TokenFormFields t={t} />
      <TokenScopeChoices t={t} scopes={scopes} setScopes={setScopes} />
      <div className="form-actions">
        <Button disabled={!ready || busy || scopes.length === 0}>
          <KeyRound size={16} />
          {t.createToken}
        </Button>
      </div>
    </form>
  )
}
