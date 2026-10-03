import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from './font-preview'

test('unsigned routes, translated dialog, keyboard dismissal and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/memories')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#workspace-content')).toBeFocused()
  for (const route of [
    '/memories',
    '/connect',
    '/tokens',
    '/usage',
    '/catalog',
  ]) {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    await assertAccessible(page, info, { label: `unsigned-${route.slice(1)}` })
  }
  const trigger = page.getByRole('button', { name: 'Run now', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await assertAccessible(page, info, { label: 'unsigned-run-dialog' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: '简体中文', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.getByRole('button', { name: '立即运行', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
  await assertAccessible(page, info, { label: 'chinese-run-dialog' })
  await captureState(page, info, 'chinese-run-dialog')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
})
