import { test } from '@playwright/test'
import { assertAccessible } from '@ztd-me/frontend-checks/playwright'

// Isolated consumer probe, never part of the application's passing browser suite.
// Its wrapper accepts only a real Axe assertion failure plus retained evidence.
test('deliberate accessibility failure retains complete evidence', async ({ page }, info) => {
  await page.setContent('<html lang="en"><head><title>Evidence probe</title></head>'
    + '<body><main><h1>Evidence probe</h1><button></button></main></body></html>')
  await assertAccessible(page, info, { label: 'expected-button-name-failure' })
})
