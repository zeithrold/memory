import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from './font-preview'
import { chooseAppearance, chooseChinese, preferenceKey } from './preferences-fixture'

test('shared SSR selection, footer and landmarks survive route navigation', async ({ context, page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const selection = { version: 1, mode: 'dark', palette: 'ocean', locale: 'zh-CN' }
  await context.addCookies([
    { name: preferenceKey, value: encodeURIComponent(JSON.stringify(selection)), url: 'http://localhost:3100' },
    { name: 'locale', value: 'en', url: 'http://localhost:3100' },
  ])
  const response = await page.goto('/memories')
  expect(await response?.text()).toContain('data-frontend-mode="dark"')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('html')).toHaveAttribute('data-frontend-palette', 'ocean')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('contentinfo')).toContainText('© Zeithrold')
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/zeithrold/memory',
  )
  await expect(page.getByRole('link', { name: 'hello@ztd.me' })).toHaveAttribute('href', 'mailto:hello@ztd.me')
  await page.getByRole('link', { name: 'API 令牌', exact: true }).click()
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '创建令牌' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('system colors resolve before hydration and explicit mode remains fixed', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.route('**/_next/static/**/*.js', async route => await route.abort())
  await page.goto('/memories')
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).colorScheme)).toBe('dark')
  await page.unroute('**/_next/static/**/*.js')
  await page.reload()
  await chooseAppearance(page, 'Light')
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).colorScheme)).toBe('light')
  await chooseAppearance(page, 'System')
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).colorScheme)).toBe('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).colorScheme)).toBe('light')
})

test('appearance and language keyboard controls restore focus and preserve choices', async ({ page }, info) => {
  await page.goto('/memories')
  const appearance = page.getByRole('button', { name: 'Appearance', exact: true })
  await appearance.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menu').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map(async animation => await animation.finished))
  })
  await assertAccessible(page, info, { label: 'appearance-menu' })
  await page.keyboard.press('Escape')
  await expect(appearance).toBeFocused()
  await chooseAppearance(page, 'Moss')
  await chooseChinese(page)
  await expect(page.locator('[inert]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-frontend-palette', 'moss')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})

test('silent cookie rejection leaves shared controls usable in memory', async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: () => '', set: () => {} })
    Storage.prototype.setItem = () => {
      throw new DOMException('Denied', 'SecurityError')
    }
  })
  await page.goto('/memories')
  await chooseAppearance(page, 'Dark')
  await chooseChinese(page)
  await expect(page.locator('html')).toHaveAttribute('data-frontend-mode', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect((await context.cookies()).find(cookie => cookie.name === preferenceKey)).toBeUndefined()
})

for (const locale of ['en', 'zh-CN']) {
  test(`all six palettes and explicit modes: ${locale}`, async ({ page }, info) => {
    test.setTimeout(120000)
    await page.goto('/catalog')
    if (locale === 'zh-CN') {
      await chooseChinese(page)
    }
    for (const [mode, translatedMode] of [
      ['Light', '浅色'],
      ['Dark', '深色'],
    ] as const) {
      await chooseAppearance(page, locale === 'en' ? mode : translatedMode)
      for (const [palette, translated] of [
        ['Neutral', '中性'],
        ['Terracotta', '暖陶'],
        ['Moss', '苔绿'],
        ['Ocean', '海蓝'],
        ['Plum', '莓紫'],
        ['Graphite', '石墨'],
      ] as const) {
        await chooseAppearance(page, locale === 'en' ? palette : translated)
        const label = `${locale}-${mode}-${palette}`
        await assertAccessible(page, info, { label })
        await captureState(page, info, label)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
  })
}

test('public documentation and missing routes have one shared shell and main landmark', async ({ page }, info) => {
  for (const route of [
    '/errors',
    '/errors/version-conflict',
    '/errors/not-a-real-error',
    '/not-a-real-route',
  ]) {
    await page.goto(route)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await assertAccessible(page, info, { label: `public-${route.replaceAll('/', '-')}` })
  }
})
