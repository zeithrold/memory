import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { FRONTEND_READY_ATTRIBUTE } from '../../lib/frontend-ready'

/**
 * Wait for the shell to hydrate before pressing keys. Event handlers only exist
 * after hydration, so retrying a key press until the UI reacts can press twice
 * and toggle the state it was meant to open.
 */
export async function waitForFrontendReady(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute(FRONTEND_READY_ATTRIBUTE, 'true')
}
