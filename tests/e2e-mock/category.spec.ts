import type { CategoryDetail } from '../../components/category-types'
import { expect } from '@playwright/test'
import { assertAccessible, captureState } from '@ztd-me/frontend-checks/playwright'
import { test } from '../e2e/font-preview'
import { mockWorkspace } from './fixture'

const parent: CategoryDetail['category'] = {
  id: '44444444-4444-4444-8444-444444444444',
  parentId: null,
  depth: 1,
  slug: 'interface-decisions',
  label: 'Interface decisions',
  description: 'Decisions about interface structure, reading and interaction.',
  boundary: 'Include interface decisions.',
  axisHint: null,
  memberCount: 1,
  state: 'active',
  createdBy: 'agent',
  updatedAt: '2026-10-23T08:00:00.000Z',
}
const child: CategoryDetail['category'] = {
  ...parent,
  id: '55555555-5555-4555-8555-555555555555',
  parentId: parent.id,
  depth: 2,
  slug: 'reading-and-typography',
  label: 'Reading and typography',
}
const member: CategoryDetail['memories'][number] = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'A smaller scale with a clear reading hierarchy',
  kind: 'decision',
  project: 'interface-review',
  isPrimary: true,
  updatedAt: parent.updatedAt,
}

for (const dismissal of ['escape', 'button'] as const) {
  test(`child category retains its opener through loading and ${dismissal} dismissal`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 850 })
    const state = await mockWorkspace(page)
    const ready = Promise.withResolvers<undefined>()
    let requests = 0
    await page.route('**/api/v1/catalog/categories/**', async (route) => {
      const isChild = new URL(route.request().url()).pathname.endsWith(child.id)
      if (isChild) {
        requests += 1
        await ready.promise
      }
      const detail: CategoryDetail = {
        category: isChild ? child : parent,
        children: isChild ? [] : [child],
        memories: [member],
        total: 1,
        offset: 0,
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail) })
    })
    await page.goto(`/catalog/${parent.id}`)
    const opener = page.getByRole('button').filter({ hasText: child.label })
    await opener.focus()
    await opener.press('Enter')
    await expect(opener).toBeDisabled()
    await expect(opener).toBeFocused()
    await opener.press('Enter')
    expect(requests).toBe(1)
    ready.resolve(undefined)
    const dialog = page.getByRole('dialog', { name: child.label, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: member.title, exact: true })).toBeVisible()
    await dialog.evaluate(async node => await Promise.all(node.getAnimations().map(async a => await a.finished)))
    await assertAccessible(page, info, { label: `child-category-${dismissal}` })
    await captureState(page, info, `child-category-${dismissal}`)
    if (dismissal === 'escape') {
      await page.keyboard.press('Escape')
    }
    else {
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    }
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    expect(requests).toBe(1)
    expect(state.unexpected).toEqual([])
  })
}
