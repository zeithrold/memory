'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Palette as PaletteIcon } from 'lucide-react'
import { useFrontendPreferences } from './context.js'
import { shellMessages } from './messages.js'
import { isMode, isPalette } from './preferences.js'
import { MODES, PALETTES } from './types.js'
import { Button } from './ui/button.js'
import { menuClass } from './ui/classes.js'
import { cn } from './ui/cn.js'
import { MenuChoice } from './ui/menu-choice.js'

export function AppearanceMenu(): React.JSX.Element {
  const state = useFrontendPreferences()
  const messages = shellMessages(state.preferences.locale)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button className={cn('gap-1.5 px-2')} variant="ghost" aria-label={messages.appearance}>
          <PaletteIcon aria-hidden="true" size={16} />
          <span className={cn('ztd-wide-label hidden sm:inline')}>{messages.appearance}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={state.portalContainer}>
        <DropdownMenu.Content className={cn(`${menuClass} w-55`)} sideOffset={8} align="end">
          <DropdownMenu.Label
            className={cn('ztd-menu-label px-2 py-1.5 text-help text-muted-foreground')}
          >
            {messages.mode}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={state.preferences.mode}
            onValueChange={(mode) => {
              if (isMode(mode)) {
                state.setMode(mode)
              }
            }}
          >
            {MODES.map(mode => <MenuChoice key={mode} value={mode}>{messages.modes[mode]}</MenuChoice>)}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={cn('ztd-separator mx-1.5 my-1.5 h-px bg-border')} />
          <DropdownMenu.Label
            className={cn('ztd-menu-label px-2 py-1.5 text-help text-muted-foreground')}
          >
            {messages.palette}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={state.preferences.palette}
            onValueChange={(palette) => {
              if (isPalette(palette)) {
                state.setPalette(palette)
              }
            }}
          >
            {PALETTES.map(palette => (
              <MenuChoice key={palette} value={palette}>
                <span
                  className={cn('ztd-swatch size-3 rounded-full border border-border bg-foreground')}
                  data-swatch={palette}
                  style={{ backgroundColor: `var(--ztd-swatch-${palette})` }}
                  aria-hidden="true"
                />
                {messages.palettes[palette]}
              </MenuChoice>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
