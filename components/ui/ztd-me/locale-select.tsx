'use client'

import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useFrontendPreferences } from './context.js'
import { shellMessages } from './messages.js'
import { isLocale } from './preferences.js'
import { inertBackground } from './ui/inert.js'

const languages = [
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
] as const

export function LocaleSelect(): React.JSX.Element {
  const state = useFrontendPreferences()
  const messages = shellMessages(state.preferences.locale)
  return (
    <Select.Root
      value={state.preferences.locale}
      onValueChange={(locale) => {
        if (isLocale(locale)) {
          state.setLocale(locale)
        }
      }}
    >
      <Select.Trigger className="ztd-control ztd-locale" aria-label={messages.language}>
        <Select.Value />
        <Select.Icon><ChevronDown size={14} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={state.portalContainer}>
        <Select.Content asChild position="popper" sideOffset={8} align="end">
          <div className="ztd-overlay ztd-menu ztd-locale-menu" ref={inertBackground}>
            <Select.Viewport {...(state.styleNonce === undefined ? {} : { nonce: state.styleNonce })}>
              {languages.map(language => (
                <Select.Item key={language.id} value={language.id} className="ztd-menu-item">
                  <Select.ItemIndicator className="ztd-indicator">
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText><span lang={language.id}>{language.label}</span></Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </div>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
