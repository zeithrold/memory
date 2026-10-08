'use client'

import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { useFrontendPreferences } from './context.js'
import { shellMessages } from './messages.js'
import { isLocale } from './preferences.js'
import { focusClass, indicatorClass, menuClass, menuItemClass } from './ui/classes.js'
import { cn } from './ui/cn.js'
import { inertBackground } from './ui/inert.js'

const layout1Class = [
  'shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180',
  'motion-reduce:transition-none',
].join(' ')

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
      <Select.Trigger
        className={cn([
          'ztd-control ztd-locale group inline-flex min-h-11 min-w-11 items-center',
          'justify-center gap-1.5 rounded-lg border border-transparent bg-transparent',
          'px-2 py-2 text-control text-foreground hover:bg-muted',
          'data-[state=open]:bg-muted',
          focusClass,
        ].join(' '))}
        aria-label={messages.language}
      >
        <Select.Value />
        <Select.Icon><ChevronDown className={cn(layout1Class)} size={14} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={state.portalContainer}>
        <Select.Content asChild position="popper" sideOffset={8} align="end">
          <div
            className={cn(`${menuClass} ztd-locale-menu min-w-[max(128px,var(--radix-select-trigger-width))]`)}
            ref={inertBackground}
          >
            <Select.Viewport {...(state.styleNonce === undefined ? {} : { nonce: state.styleNonce })}>
              {languages.map(language => (
                <Select.Item key={language.id} value={language.id} className={cn(menuItemClass)}>
                  <Select.ItemIndicator className={cn(indicatorClass)}>
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
