import type { Page } from '@playwright/test'
import type { FrontendPreferences } from '@/components/ui/ztd-me'
import { expect } from '@playwright/test'
import { preferenceCookie } from '@/components/ui/ztd-me'
import { memoryFrontendBootstrap, memoryPreferencePolicy } from '../../lib/frontend-preferences'
import { test } from './font-preview'

const selected = { version: 1, mode: 'dark', palette: 'ocean', locale: 'zh-CN' } as const
const production = 'https://memory.ztd.me'
const preview = 'https://preview.memory.ztd.me'
const development = 'http://localhost:3100'

test('production sharing and preview/development isolation', async ({ context, page }) => {
  // Every request is synthetic; no production origin is contacted.
  await context.route('**/*', async route => await route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><title>Cookie scope fixture</title><body></body></html>',
  }))
  await page.goto(production)
  await writePreference(page, production)
  expect(await context.cookies('https://portal.ztd.me')).toContainEqual(expect.objectContaining({
    name: 'ztd.frontend.v1',
    domain: '.ztd.me',
    secure: true,
  }))
  await page.goto(preview)
  expect((await readPreferences(page, preview)).locale).toBe('en')
  await writePreference(page, preview)
  expect(await readPreferences(page, preview)).toEqual(selected)
  expect(await context.cookies(preview)).toContainEqual(expect.objectContaining({
    name: 'ztd.frontend.preview.memory.v1',
    domain: 'preview.memory.ztd.me',
    secure: true,
  }))
  expect((await context.cookies('https://portal.ztd.me')).map(cookie => cookie.name)).toEqual(['ztd.frontend.v1'])
  await page.goto(development)
  expect((await readPreferences(page, development)).locale).toBe('en')
  await writePreference(page, development)
  expect(await readPreferences(page, development)).toEqual(selected)
  expect(await context.cookies(development)).toContainEqual(expect.objectContaining({
    name: 'ztd.frontend.development.memory.v1',
    domain: 'localhost',
    secure: false,
  }))
  expect((await context.cookies(development)).map(cookie => cookie.name)).toEqual([
    'ztd.frontend.development.memory.v1',
  ])
})

async function writePreference(page: Page, origin: string): Promise<void> {
  const cookie = preferenceCookie(selected, memoryPreferencePolicy(origin))
  await page.evaluate((value) => {
    document.cookie = value
  }, cookie)
}

async function readPreferences(page: Page, origin: string): Promise<FrontendPreferences> {
  return memoryFrontendBootstrap(origin, await page.evaluate(() => document.cookie), 'en').initialPreferences
}
