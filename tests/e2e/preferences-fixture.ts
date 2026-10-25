import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { waitForFrontendReady } from './frontend-ready'

export const preferenceKey = 'ztd.frontend.development.memory.v1'

export async function chooseAppearance(page: Page, name: string): Promise<void> {
  await waitForFrontendReady(page)
  const trigger = page.getByRole('button', { name: /Appearance|外观/u, exact: true })
  await trigger.press('Enter')
  await page.getByRole('menuitemradio', { name, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger).toBeFocused()
}

export async function chooseChinese(page: Page): Promise<void> {
  await waitForFrontendReady(page)
  await page.getByRole('combobox', { name: 'Language', exact: true }).press('Enter')
  await page.getByRole('option', { name: '简体中文', exact: true }).press('Enter')
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toBeFocused()
}
