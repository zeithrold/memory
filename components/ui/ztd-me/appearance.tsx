'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Palette as PaletteIcon } from 'lucide-react'
import { useFrontendPreferences } from './context.js'
import { shellMessages } from './messages.js'
import { isMode, isPalette } from './preferences.js'
import { MODES, PALETTES } from './types.js'
import { Button } from './ui/button.js'
import { MenuChoice } from './ui/menu-choice.js'

export function AppearanceMenu(): React.JSX.Element {
  const state = useFrontendPreferences()
  const messages = shellMessages(state.preferences.locale)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button aria-label={messages.appearance}>
          <PaletteIcon aria-hidden="true" size={16} />
          <span className="ztd-wide-label">{messages.appearance}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={state.portalContainer}>
        <DropdownMenu.Content className="ztd-overlay ztd-menu" sideOffset={8} align="end">
          <DropdownMenu.Label className="ztd-menu-label">{messages.mode}</DropdownMenu.Label>
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
          <DropdownMenu.Separator className="ztd-separator" />
          <DropdownMenu.Label className="ztd-menu-label">{messages.palette}</DropdownMenu.Label>
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
                <span className="ztd-swatch" data-swatch={palette} aria-hidden="true" />
                {messages.palettes[palette]}
              </MenuChoice>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
