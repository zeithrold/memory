import type { Page } from '@playwright/test'

declare global {
  interface Window { memoryFontCspViolations: string[] }
}
export async function observeFonts(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', (request) => {
    if (/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//u.test(request.url())) {
      errors.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown request failure'}`)
    }
  })
  await page.addInitScript(() => {
    window.memoryFontCspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.memoryFontCspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`)
    })
  })
  return errors
}
