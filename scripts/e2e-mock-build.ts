import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import process from 'node:process'

// A separate compiled UI enables session affordances, but its APIs are intercepted
// by synthetic browser fixtures. This domain is never a credential or live login.
// Restore the unsigned artifact even on failure: check:bundle and deployment must
// never inspect or upload the configured test preview.
const root = '.zt/previews'
const unsigned = `${root}/unsigned`
const configured = `${root}/configured`
mkdirSync(root, { recursive: true })
rmSync(unsigned, { recursive: true, force: true })
cpSync('dist', unsigned, { recursive: true })
try {
  const result = spawnSync('pnpm', [
    'exec',
    'vinext',
    'build',
  ], {
    env: {
      ...process.env,
      NEXT_PUBLIC_ACCESS_TEAM_DOMAIN: 'https://memory-browser-preview.cloudflareaccess.com',
      NEXT_PUBLIC_SENTRY_DSN: '',
      SENTRY_AUTH_TOKEN: '',
      SENTRY_RELEASE: '',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`The mocked-session preview build failed: ${result.status ?? 'unknown'}.`)
  }
  rmSync(configured, { recursive: true, force: true })
  cpSync('dist', configured, { recursive: true })
}
finally {
  rmSync('dist', { recursive: true, force: true })
  cpSync(unsigned, 'dist', { recursive: true })
  rmSync(unsigned, { recursive: true, force: true })
}
