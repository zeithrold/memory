import { defineConfig, devices } from '@playwright/test'
import { verificationArtifacts } from '@ztd-me/frontend-checks/playwright'

const artifacts = verificationArtifacts('.zt/artifacts/failure-probe')
export default defineConfig({
  ...artifacts,
  testDir: './tests/evidence',
  workers: 1,
  use: { ...artifacts.use, ...devices['Desktop Chrome'] },
})
