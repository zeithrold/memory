import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { test } from './font-preview'
import { observePreferenceStorage, retainedStorage } from './preference-storage-fixture'
import { chooseAppearance, chooseChinese, preferenceKey } from './preferences-fixture'

const selected = { version: 1, mode: 'dark', palette: 'ocean', locale: 'zh-CN' } as const
const defaults = { version: 1, mode: 'system', palette: 'neutral', locale: 'en' } as const
const retiredLocale = { name: 'locale', value: 'zh-CN', url: 'http://localhost:3100' }
const productionValue = encodeURIComponent(JSON.stringify(selected))

for (const scenario of [
  { name: 'missing', cookie: null, preferences: defaults },
  { name: 'valid current format', cookie: productionValue, preferences: selected },
  { name: 'future current format', cookie: '%7B%22version%22%3A2%7D', preferences: defaults },
  { name: 'malformed current format', cookie: 'broken', preferences: defaults },
]) {
  test(`retired storage is ignored and retained with ${scenario.name} preferences`, async ({ context, page }) => {
    await observePreferenceStorage(page)
    await seedPreferenceCookies(context, scenario.cookie)
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en' })
    const response = await page.goto('/memories')
    expect(await response?.text()).toContain(`data-frontend-mode="${scenario.preferences.mode}"`)
    const appearance = page.getByRole('button', { name: /Appearance|外观/u, exact: true })
    await appearance.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('html')).toHaveAttribute('lang', scenario.preferences.locale)
    await expect(page.locator('html')).toHaveAttribute('data-frontend-palette', scenario.preferences.palette)
    await assertNoAutomaticPersistence(page)
    const before = (await context.cookies()).find(cookie => cookie.name === preferenceKey)
    expect(before?.value ?? null).toBe(scenario.cookie)
    await chooseAppearance(page, scenario.preferences.locale === 'en' ? 'Moss' : '苔绿')
    if (scenario.preferences.locale === 'en') {
      await chooseChinese(page)
    }
    await assertOnlyCurrentWrites(page)
    const cookies = await context.cookies()
    expect(cookies.find(cookie => cookie.name === 'locale')?.value).toBe(retiredLocale.value)
    expect(cookies.find(cookie => cookie.name === 'ztd.frontend.v1')?.value).toBe(productionValue)
    const value = cookies.find(cookie => cookie.name === preferenceKey)?.value ?? ''
    const persisted: unknown = JSON.parse(decodeURIComponent(value))
    expect(persisted).toEqual({ ...scenario.preferences, palette: 'moss', locale: 'zh-CN' })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('html')).toHaveAttribute('data-frontend-palette', 'moss')
  })
}

async function seedPreferenceCookies(context: BrowserContext, value: string | null): Promise<void> {
  await context.addCookies([
    retiredLocale,
    { name: 'ztd.frontend.v1', value: productionValue, url: 'http://localhost:3100' },
  ])
  if (value !== null) {
    await context.addCookies([
      { name: preferenceKey, value, url: 'http://localhost:3100' },
    ])
  }
}

async function assertNoAutomaticPersistence(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(await page.evaluate(() => window.memoryPreferenceProbe.accesses)).toEqual([])
  expect(await page.evaluate(() => window.memoryPreferenceCookieWrites)).toEqual([])
  expect(await page.evaluate(() => window.memoryPreferenceProbe.retained())).toEqual(retainedStorage)
}

async function assertOnlyCurrentWrites(page: Page): Promise<void> {
  const accesses = await page.evaluate(() => window.memoryPreferenceProbe.accesses)
  expect(accesses.length).toBeGreaterThan(0)
  expect(accesses.every(access => access.operation === 'write' && access.key === preferenceKey)).toBe(true)
  const writes = await page.evaluate(() => window.memoryPreferenceCookieWrites)
  expect(writes.length).toBeGreaterThan(0)
  expect(writes.every(value => value.startsWith(`${preferenceKey}=`))).toBe(true)
  expect(await page.evaluate(() => window.memoryPreferenceProbe.retained())).toEqual(retainedStorage)
}
