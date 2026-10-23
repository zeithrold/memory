import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from './font-preview'

test('compact controls retain hit targets and entering/exiting menu behavior', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/memories')
  await page.evaluate(() => {
    window.memoryMenuAnimations = []
    document.addEventListener('animationstart', (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('ztd-menu')) {
        window.memoryMenuAnimations.push({
          name: event.animationName,
          pointerEvents: getComputedStyle(event.target).pointerEvents,
        })
      }
    })
  })
  const appearance = page.getByRole('button', { name: 'Appearance', exact: true })
  const bounds = await appearance.boundingBox()
  expect(bounds?.height).toBeGreaterThanOrEqual(44)
  await expect(appearance.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  await appearance.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  expect(await menu.evaluate(node => getComputedStyle(node).animationDuration)).toBe('0.15s')
  await menu.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map(async animation => await animation.finished))
  })
  await assertAccessible(page, info, { label: 'compact-appearance-menu' })
  await captureState(page, info, 'compact-appearance-menu')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(appearance).toBeFocused()
  const animations = await page.evaluate(() => window.memoryMenuAnimations)
  expect(animations).toContainEqual(expect.objectContaining({ name: 'ztd-menu-enter' }))
  expect(animations).toContainEqual({ name: 'ztd-menu-exit', pointerEvents: 'none' })
  await expect(page.locator('[inert]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('reduced motion removes menu animations and preserves keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/memories')
  const appearance = page.getByRole('button', { name: 'Appearance', exact: true })
  await appearance.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  expect(await menu.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(appearance).toBeFocused()
  await expect(page.locator('[inert]')).toHaveCount(0)
})

test('public recovery keeps the compact brand and translated keyboard return at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const response = await page.goto('/missing-memory-page')
  expect(response?.status()).toBe(404)
  await page.getByRole('combobox', { name: 'Language', exact: true }).click()
  await page.getByRole('option', { name: '简体中文', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('没有找到这一页')
  await page.evaluate(async () => await document.fonts.ready)
  const lines = await page.locator('.ztd-brand > span').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([
      ...range.getClientRects(),
    ].map(rect => Math.round(rect.y))).size
  })
  expect(lines).toBe(1)
  await assertAccessible(page, info, { label: 'public-recovery-zh' })
  await captureState(page, info, 'public-recovery-zh')
  const back = page.getByRole('link', { name: '返回记忆', exact: true })
  await back.focus()
  await back.press('Enter')
  await expect(page).toHaveURL(/\/memories$/u)
})
