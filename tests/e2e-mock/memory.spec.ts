import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from '../e2e/font-preview'
import { mockWorkspace } from './fixture'

async function createMemory(page: Page, info: TestInfo): Promise<void> {
  await page.getByRole('button', { name: 'New memory', exact: true }).click()
  await page.locator('#memory-title').fill('New context')
  await page.locator('#memory-content').fill('Remember the new context.')
  await page.locator('#memory-source').fill('https://example.com/new')
  await assertAccessible(page, info, { label: 'memory-editor' })
  await page.getByRole('button', { name: 'Save memory', exact: true }).click()
  await expect(page.getByText('New context', { exact: true })).toBeVisible()
}
async function editMemory(page: Page, info: TestInfo): Promise<void> {
  await page.getByRole('link', { name: 'Original decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Original decision', exact: true })).toBeVisible()
  await assertAccessible(page, info, { label: 'memory-detail' })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('#memory-title').fill('Edited decision')
  await page.getByRole('button', { name: 'Save memory', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edited decision', exact: true })).toBeVisible()
}
test('mocked session: accessible create/edit/search preserve mutation contracts', async ({ page }, info) => {
  const state = await mockWorkspace(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/memories')
  await expect(page.locator('body')).toHaveCSS('color-scheme', 'dark')
  await expect(page.getByText('Original decision', { exact: true })).toBeVisible()
  await assertAccessible(page, info, { label: 'memory-list' })
  await createMemory(page, info)
  await editMemory(page, info)
  await page.getByRole('link', { name: 'Back to memories' }).click()
  await page.getByRole('textbox', { name: 'Search your memories' }).fill('New')
  await page.getByRole('button', { name: 'Search your memories' }).click()
  await expect(page.getByText('New context', { exact: true })).toBeVisible()
  await expect(page.getByText('Edited decision', { exact: true })).toHaveCount(0)
  await assertAccessible(page, info, { label: 'memory-search' })
  await captureState(page, info, 'memory-search')
  expect(state.memories.find(memory => memory.title === 'Edited decision')?.version).toBe(2)
  expect(state.unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('mocked service failure preserves query and permits recovery', async ({ page }, info) => {
  const state = await mockWorkspace(page)
  state.failMemories = true
  await page.goto('/memories')
  await expect(page.getByText('Please retry this request.')).toBeVisible()
  await assertAccessible(page, info, { label: 'memory-load-error' })
  state.failMemories = false
  await page.reload()
  await expect(page.getByText('Original decision', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search your memories' }).fill('New')
  state.failSearch = true
  await page.getByRole('button', { name: 'Search your memories' }).click()
  await expect(page.getByText('Please retry this request.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search your memories' })).toHaveValue('New')
  const toast = page.locator('.app-toast').filter({ hasText: 'Please retry this request.' })
  await expect(toast).toHaveCSS('opacity', '1')
  await assertAccessible(page, info, { label: 'memory-search-error' })
  state.failSearch = false
  await page.getByRole('button', { name: 'Search your memories' }).click()
  await expect(page.getByText('Make room for what matters.', { exact: true })).toBeVisible()
  await assertAccessible(page, info, { label: 'memory-empty-search' })
  expect(state.unexpected).toEqual([])
})

test('configured preview still rejects real anonymous API requests', async ({ request }) => {
  const response = await request.get('/api/v1/memories')
  expect(response.status()).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
})

test('mocked session keeps logout with Memory Access and returns to this origin', async ({ page }) => {
  await mockWorkspace(page)
  let logout: string | undefined
  await page.route('https://memory-browser-preview.cloudflareaccess.com/cdn-cgi/access/logout?**', async (route) => {
    logout = route.request().url()
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html lang="en"><body>Logout fixture</body></html>',
    })
  })
  await page.goto('/memories')
  await expect(page.getByText('Original decision', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect.poll(() => logout).toBe('https://memory-browser-preview.cloudflareaccess.com/cdn-cgi/access/logout'
    + '?returnTo=http%3A%2F%2Flocalhost%3A3101')
})
