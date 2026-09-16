import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // The preview is one workerd process. Running the browsers against it
  // concurrently makes cold page loads contend, which surfaces as flaky
  // web-first assertions rather than as a real failure. Serialized, the whole
  // suite finishes in seconds.
  workers: 1,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  // Preview and unauthenticated API checks never need remote bindings or secrets.
  webServer: { command: 'pnpm exec wrangler dev --config tests/e2e/wrangler.json --local --port 3100 --ip 127.0.0.1', url: 'http://localhost:3100', reuseExistingServer: false, timeout: 60000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
