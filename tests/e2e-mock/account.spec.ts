import type { TokenSummary } from '../../lib/contracts'
import { expect } from '@playwright/test'
import { test } from '../e2e/font-preview'
import { mockWorkspace } from './fixture'
import { verifyAndDismissToast } from './toast-assertions'

for (const mode of ['missing', 'denied'] as const) {
  test(`copy feedback handles a ${mode} clipboard without an unhandled error`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript((clipboardMode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboardMode === 'missing'
          ? undefined
          : {
              async writeText() { return await Promise.reject(new Error('Clipboard denied by the fixture')) },
            },
      })
    }, mode)
    const state = await mockWorkspace(page)
    await page.goto('/connect')
    const appearance = page.getByRole('button', { name: 'Appearance', exact: true })
    await expect.poll(async () => {
      await appearance.press('Enter')
      return await page.getByRole('menu').isVisible()
    }).toBe(true)
    await page.keyboard.press('Escape')
    await expect(appearance).toBeFocused()
    const copy = page.getByRole('button', { name: 'Copy', exact: true }).first()
    await copy.click()
    await verifyAndDismissToast(page, info, 'Copy failed. Select the text manually.')
    await expect(copy).toHaveText('Copy')
    expect(errors).toEqual([])
    expect(state.unexpected).toEqual([])
  })
}

test('a replacement token resets copied feedback and long token names reflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { async writeText() { return await Promise.resolve() } },
    })
  })
  const state = await mockWorkspace(page)
  const token: TokenSummary = {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'LongConnectionName'.repeat(5).slice(0, 80),
    prefix: 'mem_visual',
    scopes: ['memory:read'],
    project: 'interface-review'.padEnd(64, 'x'),
    created_at: '2026-10-23T08:00:00.000Z',
    expires_at: '2027-01-21T08:00:00.000Z',
    revoked_at: null,
    last_used_at: null,
  }
  let created = 0
  await page.route('**/api/v1/tokens', async (route) => {
    const body = route.request().method() === 'POST'
      ? { token: `mem_VISUAL_FIXTURE_ONLY_${++created}` }
      : { tokens: [token] }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/tokens')
  await expect(page.locator('.token-row strong')).toHaveText(token.name)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const names = ['First fixture connection', 'Second fixture connection']
  for (const [index, name] of names.entries()) {
    await page.locator('#token-name').fill(name)
    await page.locator('form').getByRole('button').click()
    await expect.poll(() => created).toBe(index + 1)
    const box = page.locator('.secret-box')
    await expect(box.locator('code')).toHaveText(`mem_VISUAL_FIXTURE_ONLY_${index + 1}`)
    const copy = box.getByRole('button', { name: 'Copy', exact: true })
    await expect(copy).toBeVisible()
    await copy.click()
    await expect(box.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  }
  expect(created).toBe(2)
  expect(state.unexpected).toEqual([])
})
