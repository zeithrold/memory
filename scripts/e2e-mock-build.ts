import { spawnSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import process from 'node:process'

// A separate compiled UI enables session affordances, but its APIs are intercepted
// by synthetic browser fixtures. This domain is never a credential or live login.
// Restore the unsigned artifact even on failure: check:bundle and deployment must
// never inspect or upload the configured test preview.
// The two artifacts are moved, not copied: they share this checkout's filesystem
// and a copy of the whole Worker tree is the only repeated work in this gate.
const root = '.zt/previews'
const unsigned = `${root}/unsigned`
const configured = `${root}/configured`
mkdirSync(root, { recursive: true })
rmSync(unsigned, { recursive: true, force: true })
rmSync(configured, { recursive: true, force: true })
renameSync('dist', unsigned)
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
  renameSync('dist', configured)
}
finally {
  // A failed build can leave a partial tree behind; it must never survive as `dist`.
  rmSync('dist', { recursive: true, force: true })
  renameSync(unsigned, 'dist')
}
