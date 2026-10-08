'use client'
import type { CatalogSettings, FormState, ProbeResult } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'
import { RotateCcw, ShieldAlert } from 'lucide-react'

import { perform } from './async-action'
import { CatalogBudgetFields, CatalogProviderFields } from './catalog-settings-fields'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

import { Label } from './ui/label'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_3 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_4 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

function CatalogToggles(
  { toggles, form, switchToggle, t }: CatalogTogglesProps,
): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {toggles.map(([id, label, checked]) => (
        <div key={id} className="flex items-start justify-between gap-4">
          <Label htmlFor={`catalog-${id}`} className="font-normal">
            {label}
          </Label>
          <Switch
            id={`catalog-${id}`}
            checked={checked}
            disabled={id === 'enabled' && form.provider === 'none'}
            onCheckedChange={value => switchToggle(id, value)}
          />
        </div>
      ))}
      <p className={MUTED_CLASS}>{t.includeContentHint}</p>
    </div>
  )
}

type CatalogProbeBadgeProps = {
  probe: ProbeResult
  t: Messages
}

function CatalogProbeBadge({ probe, t }: CatalogProbeBadgeProps): React.JSX.Element {
  return (
    <Badge variant={probe.reachable && probe.toolCallingOk ? 'secondary' : 'destructive'}>
      {probe.toolCallingOk ? t.hybrid : t.keyword}
    </Badge>
  )
}
function CatalogSettingsForm(
  props: CatalogSettingsFormProps,
): React.JSX.Element {
  return (
    <CardContent className="flex flex-col gap-6">
      {props.settings?.canStoreKey === false && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>{props.t.apiKey}</AlertTitle>
          <AlertDescription>{props.t.keyUnavailable}</AlertDescription>
        </Alert>
      )}
      {props.settings !== null && props.settings.lastProbeAt !== null
        && props.settings.lastProbeError !== null
        && (
          <p className={MUTED_CLASS_1}>{`${props.t.lastProbe}: ${props.settings.lastProbeError}`}</p>
        )}

      <CatalogProviderFields t={props.t} form={props.form} patch={props.patch} settings={props.settings} />

      <div className="flex flex-col gap-2">
        <p className={MUTED_CLASS_2}>{props.t.providerHint}</p>
        <p className={MUTED_CLASS_3}>{props.t.providerNeedsPaid}</p>
      </div>

      <Separator />

      <CatalogToggles toggles={props.toggles} form={props.form} switchToggle={props.switchToggle} t={props.t} />

      <Separator />

      <CatalogBudgetFields t={props.t} form={props.form} patch={props.patch} />

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={props.busy} onClick={() => perform(props.save(), props.t.loadError)}>
          <RotateCcw size={14} />
          {props.t.saveSettings}
        </Button>
        <Button variant="secondary" disabled={props.busy} onClick={() => perform(props.test(), props.t.loadError)}>
          {props.t.testConnection}
        </Button>
        {props.probe !== null && (
          <CatalogProbeBadge probe={props.probe} t={props.t} />
        )}
      </div>
      {props.probe !== null && <p className={MUTED_CLASS_4}>{props.probe.detail}</p>}
    </CardContent>
  )
}

export function CatalogSettingsCard(props: CatalogSettingsCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.t.catalogSettings}</CardTitle>
        <CardDescription>{props.t.settingsDescription}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={() => props.setFormOpen(open => !open)}>
            {props.formOpen ? props.t.hideSettings : props.t.showSettings}
          </Button>
        </CardAction>
      </CardHeader>
      {props.formOpen && props.form !== null && (
        <CatalogSettingsForm
          settings={props.settings}
          t={props.t}
          form={props.form}
          patch={props.patch}
          toggles={props.toggles}
          switchToggle={props.switchToggle}
          busy={props.busy}
          save={props.save}
          test={props.test}
          probe={props.probe}
        />
      )}
    </Card>
  )
}

type CatalogTogglesProps = {
  toggles: [string, string, boolean][]
  form: FormState
  switchToggle: (id: string, value: boolean) => void
  t: Messages
}

type CatalogSettingsFormProps = {
  settings: CatalogSettings | null
  t: Messages
  form: FormState
  patch: (next: Partial<FormState>) => void
  toggles: [string, string, boolean][]
  switchToggle: (id: string, value: boolean) => void
  busy: boolean
  save: () => Promise<void>
  test: () => Promise<void>
  probe: ProbeResult | null
}

type CatalogSettingsCardProps = {
  t: Messages
  setFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  formOpen: boolean
  form: FormState | null
  settings: CatalogSettings | null
  patch: (next: Partial<FormState>) => void
  toggles: [string, string, boolean][]
  switchToggle: (id: string, value: boolean) => void
  busy: boolean
  save: () => Promise<void>
  test: () => Promise<void>
  probe: ProbeResult | null
}
