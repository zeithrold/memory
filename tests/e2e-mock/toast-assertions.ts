import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import { assertAccessible } from '@ztd-me/frontend-checks/playwright'

/** Validate a real, visible toast before closing it and continuing the flow. */
export async function verifyAndDismissToast(page: Page, info: TestInfo, message: string): Promise<void> {
  const toast = page.locator('.app-toast').filter({ hasText: message })
  await expect(toast).toBeVisible()
  // Sonner pauses its default timer while the user interacts with the toast.
  await toast.hover()
  await expect(toast).toHaveAttribute('data-removed', 'false')
  await expect(toast).toHaveCSS('opacity', '1')
  const title = toast.locator('[data-title]')
  await expect(title).toHaveCSS('font-size', '16px')
  const foreground = await page.locator('body').evaluate(node => getComputedStyle(node).color)
  await expect(title).toHaveCSS('color', foreground)
  expect(await title.evaluate(node => getComputedStyle(node).fontFamily)).toMatch(/^"Noto Sans"/u)
  await assertAccessible(page, info, { include: '[data-sonner-toaster]', label: `toast-${message}` })
  await info.attach(`toast-styles-${message}`, {
    body: JSON.stringify(await toast.evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        opacity: style.opacity,
        color: style.color,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
      }
    })),
    contentType: 'application/json',
  })
  await toast.getByRole('button', { name: 'Close toast', exact: true }).click()
  await expect(toast).toHaveCount(0)
}
