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

test('a direct memory link opens the detail page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/memories/11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('link', { name: 'Back to memories' })).toBeVisible()
  await expect(page.getByText('Connect your identity provider')).toBeVisible()
  // The list-only affordances must not leak onto the detail route.
  await expect(page.getByRole('button', { name: 'New memory' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('private APIs fail closed without a credential', async ({ request }) => {
  const response = await request.get('/api/v1/memories')
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(response.headers()['content-type']).toContain('application/problem+json')
  expect(await response.json()).toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    title: 'Unauthorized',
    instance: '/api/v1/memories',
    type: 'http://localhost:3100/errors/unauthorized',
  })
  const mcp = await request.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
  expect(mcp.status()).toBe(401)
  expect(mcp.headers()['www-authenticate']).toContain('resource_metadata=')
  expect(await mcp.json()).toMatchObject({
    code: 'UNAUTHORIZED',
    type: 'http://localhost:3100/errors/unauthorized',
  })
})

test('publishes OAuth discovery and refuses to guess an authorization server', async ({ request }) => {
  const discovery = await request.get('/.well-known/oauth-protected-resource')
  expect(discovery.status()).toBe(503)
  expect(await discovery.json()).toMatchObject({
    code: 'AUTH_NOT_CONFIGURED',
    status: 503,
    type: 'http://localhost:3100/errors/authorization-not-configured',
  })
  const scoped = await request.get('/.well-known/oauth-protected-resource/mcp')
  expect(scoped.status()).toBe(503)
  const method = await request.post('/.well-known/oauth-protected-resource')
  expect(method.status()).toBe(405)
  expect(method.headers().allow).toBe('GET, OPTIONS')
  expect(await method.json()).toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
  const preflight = await request.fetch('/.well-known/oauth-protected-resource', { method: 'OPTIONS' })
  expect(preflight.status()).toBe(204)
  expect(preflight.headers()['access-control-allow-origin']).toBe('*')
})

test('documents every error code under /errors', async ({ page, request }) => {
  const index = await request.get('/errors')
  expect(index.status()).toBe(200)
  const html = await index.text()
  for (const code of ['UNAUTHORIZED', 'VERSION_CONFLICT', 'INSUFFICIENT_SCOPE', 'INTERNAL_ERROR', 'METHOD_NOT_ALLOWED'])
    expect(html).toContain(code)
  await page.goto('/errors/version-conflict')
  await expect(page.getByRole('heading', { name: 'Version conflict', exact: true })).toBeVisible()
  await expect(page.getByText('VERSION_CONFLICT', { exact: true })).toBeVisible()
  const missing = await request.get('/errors/not-a-real-error')
  expect(missing.status()).toBe(404)
})
