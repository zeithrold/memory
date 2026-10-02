'use client'
import type { CatalogSettings, FormState } from './catalog-types'
import type { Messages } from '@/lib/i18n/messages'

export function formFrom(settings: CatalogSettings): FormState {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl ?? '',
    model: settings.model ?? '',
    apiKey: '',
    includeContent: settings.includeContent,
    enabled: settings.enabled,
    autoApplyStructural: settings.autoApplyStructural,
    dryRunUntilReviewed: settings.dryRunUntilReviewed,
    intervalMinutes: settings.intervalMinutes,
    maxBatch: settings.maxBatch,
    maxTurns: settings.maxTurns,
    maxToolCalls: settings.maxToolCalls,
    dailyTokenBudget: settings.dailyTokenBudget,
  }
}

interface PatchCatalogFormContext {
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>
}

export function patchCatalogForm(
  context: PatchCatalogFormContext,
  next: Partial<FormState>,
): void {
  const { setForm } = context

  setForm(current => (current === null ? current : { ...current, ...next }))
}

interface ToggleCatalogSettingContext {
  patch: (next: Partial<FormState>) => void
}

export function toggleCatalogSetting(
  context: ToggleCatalogSettingContext,
  id: string,
  value: boolean,
): void {
  const { patch } = context

  if (id === 'enabled') {
    patch({ enabled: value })
  }
  else
    if (id === 'include-content') {
      patch({ includeContent: value })
    }
    else
      if (id === 'auto-apply') {
        patch({ autoApplyStructural: value })
      }
      else {
        patch({ dryRunUntilReviewed: value })
      }
}

export function catalogToggles(
  form: FormState | null,
  t: Messages,
): [string, string, boolean][] {
  const toggles: [string, string, boolean][] = form === null
    ? []
    : [
        [
          'enabled',
          t.enableCatalog,
          form.enabled,
        ],
        [
          'include-content',
          t.includeContent,
          form.includeContent,
        ],
        [
          'auto-apply',
          t.autoApply,
          form.autoApplyStructural,
        ],
        [
          'dry-run',
          t.dryRunUntilReviewed,
          form.dryRunUntilReviewed,
        ],
      ]

  return toggles
}
