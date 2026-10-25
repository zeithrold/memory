import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { verificationArtifacts } from '@ztd-me/frontend-checks/playwright'
import preview from './playwright.config'
import { configuredOrigin } from './tests/preview-origin'

const artifacts = verificationArtifacts(`${process.env.ZT_ARTIFACTS_DIR ?? '.zt/browser'}/configured`)
const port = new URL(configuredOrigin).port
export default defineConfig({
  ...preview,
  ...artifacts,
  testDir: './tests/e2e-mock',
  use: { ...artifacts.use, baseURL: configuredOrigin, colorScheme: 'dark' },
  webServer: {
    command: 'pnpm exec wrangler dev --config '
      + `tests/e2e/wrangler.mock.json --local --inspector-port 0 --port ${port} --ip 127.0.0.1`
      + ` --var APP_ORIGIN:${configuredOrigin}`,
    url: configuredOrigin,
    reuseExistingServer: false,
    timeout: 60000,
  },
})
