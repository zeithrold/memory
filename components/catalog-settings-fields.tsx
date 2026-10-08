'use client'
import type { CatalogSettings, FormState } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { z } from 'zod'

import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

function CatalogCredentialField(
  { t, form, settings, patch }: CatalogCredentialFieldProps,
): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="catalog-key">{t.apiKey}</Label>
      <Input
        id="catalog-key"
        type="password"
        autoComplete="off"
        value={form.apiKey}
        disabled={form.provider !== 'responses-api'}
        placeholder={settings?.hasApiKey === true ? `${t.storedKey} ${settings.apiKeyHint ?? ''}` : 'sk-...'}
        onChange={event => patch({ apiKey: event.target.value })}
      />
    </div>
  )
}

export function CatalogProviderFields(
  { t, form, patch, settings }: CatalogProviderFieldsProps,
): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-provider">{t.provider}</Label>
        <Select
          value={form.provider}
          onValueChange={value => patch({
            provider: z.enum([
              'none',
              'responses-api',
              'workers-ai',
            ]).parse(value),
            // Clearing the provider cannot leave the agent enabled.
            ...(value === 'none' ? { enabled: false } : {}),
          })}
        >
          <SelectTrigger id="catalog-provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t.providerNone}</SelectItem>
            <SelectItem value="responses-api">{t.providerResponses}</SelectItem>
            <SelectItem value="workers-ai">{t.providerWorkersAi}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-model">{t.model}</Label>
        <Input
          id="catalog-model"
          value={form.model}
          placeholder={form.provider === 'workers-ai' ? '@cf/zai-org/glm-4.7-flash' : 'your-model-id'}
          onChange={event => patch({ model: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-base">{t.baseUrl}</Label>
        <Input
          id="catalog-base"
          value={form.baseUrl}
          disabled={form.provider !== 'responses-api'}
          placeholder="https://api.openai.com/v1"
          onChange={event => patch({ baseUrl: event.target.value })}
        />
      </div>
      <CatalogCredentialField t={t} form={form} settings={settings} patch={patch} />
    </div>
  )
}

function CatalogTokenBudgetField(
  { t, form, patch }: CatalogTokenBudgetFieldProps,
): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="catalog-token-budget">{t.dailyTokenBudget}</Label>
      <Input
        id="catalog-token-budget"
        type="number"
        min={10000}
        max={5000000}
        step={10000}
        value={form.dailyTokenBudget}
        onChange={event => patch({ dailyTokenBudget: Number(event.target.value) })}
      />
    </div>
  )
}

export function CatalogBudgetFields(
  { t, form, patch }: CatalogBudgetFieldsProps,
): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-interval">{t.interval}</Label>
        <Input
          id="catalog-interval"
          type="number"
          min={30}
          max={1440}
          step={30}
          value={form.intervalMinutes}
          onChange={event => patch({ intervalMinutes: Number(event.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-batch">{t.maxBatch}</Label>
        <Input
          id="catalog-batch"
          type="number"
          min={1}
          max={25}
          value={form.maxBatch}
          onChange={event => patch({ maxBatch: Number(event.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-turns">{t.maxTurns}</Label>
        <Input
          id="catalog-turns"
          type="number"
          min={1}
          max={8}
          value={form.maxTurns}
          onChange={event => patch({ maxTurns: Number(event.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="catalog-tool-calls">{t.maxToolCalls}</Label>
        <Input
          id="catalog-tool-calls"
          type="number"
          min={3}
          max={24}
          value={form.maxToolCalls}
          onChange={event => patch({ maxToolCalls: Number(event.target.value) })}
        />
      </div>
      <CatalogTokenBudgetField t={t} form={form} patch={patch} />
    </div>
  )
}

type CatalogCredentialFieldProps = {
  t: Messages
  form: FormState
  settings: CatalogSettings | null
  patch: (next: Partial<FormState>) => void
}

type CatalogProviderFieldsProps = {
  t: Messages
  form: FormState
  patch: (next: Partial<FormState>) => void
  settings: CatalogSettings | null
}

type CatalogTokenBudgetFieldProps = {
  t: Messages
  form: FormState
  patch: (next: Partial<FormState>) => void
}

type CatalogBudgetFieldsProps = {
  t: Messages
  form: FormState
  patch: (next: Partial<FormState>) => void
}
