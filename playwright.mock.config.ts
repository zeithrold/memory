import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { verificationArtifacts } from '@ztd-me/frontend-checks/playwright'
import preview from './playwright.config'

const artifacts = verificationArtifacts(`${process.env.ZT_ARTIFACTS_DIR ?? '.zt/browser'}/configured`)
export default defineConfig({
  ...preview,
  ...artifacts,
  testDir: './tests/e2e-mock',
  use: { ...artifacts.use, baseURL: 'http://localhost:3101', colorScheme: 'dark' },
  webServer: {
    command: 'pnpm exec wrangler dev --config tests/e2e/wrangler.mock.json --local --port 3101 --ip 127.0.0.1',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
