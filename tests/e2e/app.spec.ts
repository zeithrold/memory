import { expect, test } from '@playwright/test'

test('English-first preview, navigation and persisted Chinese locale', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your context, carried forward.' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByText('Connect your identity provider')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true })
  await expect(page.getByRole('button', { name: 'New memory' }).first()).toBeDisabled()
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'One memory. Every agent.' })).toBeVisible()
  await expect(page.getByText('bearer_token_env_var', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Language' }).click()
  await expect(page.getByRole('heading', { name: '一份记忆，连接不同 Agent。' })).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('heading', { name: '让每一次对话接得上。' })).toBeVisible()
  await page.getByRole('button', { name: 'API 令牌', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建令牌' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('private APIs fail closed without a credential', async ({ request }) => {
  const response = await request.get('/api/v1/memories')
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  const mcp = await request.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
  expect(mcp.status()).toBe(401)
})
