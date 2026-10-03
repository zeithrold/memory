import { expect } from '@playwright/test'
import { test } from './font-preview'
import { chooseAppearance, chooseChinese } from './preferences-fixture'

test('denied cookie reads preserve business UI and preference controls', async ({ context, page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.addInitScript(() => {
    const denied = (): never => {
      throw new DOMException('Cookie access denied', 'SecurityError')
    }
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: denied, set: denied })
  })
  await page.goto('/memories')
  try {
    await expect(page.getByRole('heading', { name: 'Your context, carried forward.' })).toBeVisible()
  }
  finally {
    await info.attach('browser-errors', { body: JSON.stringify(errors), contentType: 'application/json' })
  }
  await chooseAppearance(page, 'Dark')
  await chooseChinese(page)
  await expect(page.locator('html')).toHaveAttribute('data-frontend-mode', 'dark')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect(errors).toEqual([])
})
