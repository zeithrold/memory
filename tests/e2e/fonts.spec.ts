import type { Browser, Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { observeFonts } from './font-observation'
import { configureFontPreview, localFontPreview, test } from './font-preview'
import { addFontSpecimens, renderedFonts, renderedWeight } from './font-specimens'
import { summarizeResources, transferProfile } from './font-transfer-profile'
import { preferenceKey } from './preferences-fixture'

async function verifyTextFonts(page: Page, info: TestInfo): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  for (const [id, family] of [
    ['font-en', 'Noto Sans'],
    ['font-zh', 'Noto Sans SC'],
    ['font-ja', 'Noto Sans JP'],
    ['font-ko', 'Noto Sans KR'],
    ['font-bold strong', 'Noto Sans SC'],
  ] as const) {
    const fonts = await renderedFonts(session, `#${id}`)
    await info.attach(id, { body: JSON.stringify(fonts), contentType: 'application/json' })
    expect(fonts.length).toBeGreaterThan(0)
    expect(fonts.every(font => font.isCustomFont && font.familyName.startsWith('Noto Sans'))).toBe(true)
    expect(fonts.some(font => font.familyName.startsWith(family) && font.glyphCount > 0)).toBe(true)
  }
  const weight = await renderedWeight(page)
  await info.attach('noto-weight', { body: JSON.stringify(weight), contentType: 'application/json' })
  expect(weight).toMatchObject({ weight: '600', synthesis: 'none' })
  expect(weight.faces.some(face => face.family.includes('Noto Sans SC'))).toBe(true)
  expect(weight.widths[1]).not.toBe(weight.widths[0])
  for (const id of [
    'face',
    'heart',
    'technologist',
    'family',
    'rainbow',
    'flag',
  ]) {
    const fonts = await renderedFonts(session, `#emoji-${id}`)
    await info.attach(`emoji-${id}`, { body: JSON.stringify(fonts), contentType: 'application/json' })
    expect(fonts).toEqual([
      expect.objectContaining({ isCustomFont: true, familyName: 'Noto Color Emoji', glyphCount: 1 }),
    ])
  }
  const mixed = await renderedFonts(session, '#font-mixed')
  await info.attach('mixed-fonts', { body: JSON.stringify(mixed), contentType: 'application/json' })
  expect(mixed.every(font => font.isCustomFont && /^Noto (?:Sans|Color Emoji)/u.test(font.familyName))).toBe(true)
  expect(mixed.some(font => font.familyName === 'Noto Color Emoji')).toBe(true)
  expect(mixed.some(font => font.familyName === 'Noto Sans')).toBe(true)
}

test('Noto glyphs, weights, composed emoji, CSP and font delivery evidence', async ({ page }, info) => {
  test.setTimeout(120000)
  const errors = await observeFonts(page)
  const sample = await transferProfile(page)
  const resources = await sample('cold', async () => {
    await page.goto('/memories')
    await addFontSpecimens(page)
  })
  const fonts = resources.filter(resource => resource.kind === 'font')
  await info.attach('full-specimen-font-profile', {
    body: JSON.stringify({
      resources,
      localFontPreview,
      actualGoogleFontsBrowserLoad: !localFontPreview,
      byFamily: summarizeResources(resources),
    }),
    contentType: 'application/json',
  })
  await verifyTextFonts(page, info)
  expect(fonts.length).toBeGreaterThanOrEqual(4)
  expect(fonts.length).toBeLessThan(80)
  if (localFontPreview) {
    expect(resources.every(resource => !resource.url.startsWith('https://fonts.'))).toBe(true)
  }
  else {
    expect(resources.some(resource => new URL(resource.url).origin === 'https://fonts.googleapis.com')).toBe(true)
    expect(fonts.every(resource => new URL(resource.url).origin === 'https://fonts.gstatic.com')).toBe(true)
  }
  expect(await page.evaluate(() => window.memoryFontCspViolations)).toEqual([])
  expect(errors).toEqual([])
  await assertAccessible(page, info, { label: 'noto-full-specimen' })
  await captureState(page, info, 'noto-full-specimen')
  const warmResources = await sample('warm', async () => {
    await page.reload()
    await addFontSpecimens(page)
  })
  await info.attach('full-specimen-warm-font-profile', {
    body: JSON.stringify({
      resources: warmResources,
      localFontPreview,
      actualGoogleFontsBrowserLoad: !localFontPreview,
      byFamily: summarizeResources(warmResources),
    }),
    contentType: 'application/json',
  })
})

async function verifyBudget(browser: Browser, info: TestInfo, locale: string, coldCap: number): Promise<void> {
  const context = await browser.newContext({ locale, viewport: info.project.use.viewport })
  try {
    await configureFontPreview(context)
    await context.addCookies([
      {
        name: preferenceKey,
        value: encodeURIComponent(JSON.stringify({ version: 1, mode: 'light', palette: 'neutral', locale })),
        url: 'http://localhost:3100',
      },
    ])
    const page = await context.newPage()
    const errors = await observeFonts(page)
    const sample = await transferProfile(page)
    for (const phase of ['cold', 'warm']) {
      const resources = await sample(phase, async () => phase === 'cold'
        ? await page.goto('http://localhost:3100/memories')
        : await page.reload())
      const bytes = resources.reduce((total, resource) => total + resource.httpResponseBytes, 0)
      const cap = phase === 'cold' ? coldCap : 10_000
      await info.attach(`${locale}-${phase}-font-profile`, {
        body: JSON.stringify({
          locale,
          phase,
          bytes,
          cap,
          actualGoogleFontsBrowserLoad: !localFontPreview,
          remoteBudgetEnforced: !localFontPreview,
          byFamily: summarizeResources(resources),
          resources,
        }),
        contentType: 'application/json',
      })
      expect(resources.every(resource => resource.status === 200 || resource.status === 304)).toBe(true)
      expect(resources.some(resource => resource.kind === 'font-css')).toBe(true)
      const fonts = resources.filter(resource => resource.kind === 'font')
      expect(fonts.length).toBeGreaterThan(0)
      expect(fonts.every(resource => (resource.faces?.length ?? 0) > 0)).toBe(true)
      if (!localFontPreview) {
        expect(bytes).toBeLessThanOrEqual(cap)
      }
      expect(await page.evaluate(() => window.memoryFontCspViolations)).toEqual([])
      expect(errors).toEqual([])
    }
    await assertAccessible(page, info, { label: `noto-representative-${locale}` })
    await captureState(page, info, `noto-representative-${locale}`)
  }
  finally {
    await context.close()
  }
}

test('English/Chinese cold/warm font profiles with remote budgets required in CI', async ({ browser }, info) => {
  test.setTimeout(120000)
  await verifyBudget(browser, info, 'en', 500_000)
  await verifyBudget(browser, info, 'zh-CN', 1_000_000)
})
