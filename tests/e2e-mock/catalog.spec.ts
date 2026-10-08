import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from '../e2e/font-preview'
import { mockWorkspace } from './fixture'
import { verifyAndDismissToast } from './toast-assertions'

async function checkFocusTrap(page: Page, dialog: Locator): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
}

async function settleDialogMotion(dialog: Locator): Promise<void> {
  await dialog.evaluate(async (node) => {
    const finite = node.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.all(finite.map(async animation => await animation.finished.catch(() => {})))
  })
}

test('mocked session: polling retains draft and keyboard run dialog is translated', async ({ page }, info) => {
  const state = await mockWorkspace(page)
  await page.goto('/catalog')
  await page.getByRole('button', { name: 'Configure', exact: true }).click()
  await page.locator('#catalog-model').fill('unsaved-draft')
  await expect.poll(() => state.settingsReads, { timeout: 10000 }).toBeGreaterThan(1)
  await expect(page.locator('#catalog-model')).toHaveValue('unsaved-draft')
  await assertAccessible(page, info, { label: 'catalog-settings' })
  state.run.status = 'succeeded'
  state.run.finishedAt = state.run.startedAt
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect.poll(() => state.settings.model).toBe('unsaved-draft')
  await verifyAndDismissToast(page, info, 'Catalog settings saved.')
  const trigger = page.getByRole('button', { name: 'Run now', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.focus()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await checkFocusTrap(page, dialog)
  await settleDialogMotion(dialog)
  await assertAccessible(page, info, { label: 'configured-run-dialog' })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await expect.poll(() => state.runsStarted).toBe(1)
  await expect(dialog).toBeHidden()
  await verifyAndDismissToast(page, info, 'Run started.')
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: '简体中文', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.getByRole('button', { name: '立即运行', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
  await settleDialogMotion(dialog)
  await assertAccessible(page, info, { label: 'configured-chinese-dialog' })
  await captureState(page, info, 'configured-chinese-dialog')
  await page.keyboard.press('Escape')
  expect(state.unexpected).toEqual([])
})
