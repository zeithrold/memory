import { spawnSync } from 'node:child_process'
import process from 'node:process'

// The e2e preview must stay unsigned: it asserts that discovery fails closed and
// that no identity provider is configured. `vinext build` loads `.env.local`,
// and both the page and `accessIssuer()` fall back to the value inlined at build
// time, so a developer's real Access team domain would otherwise reach the
// preview. An explicitly empty variable takes precedence over `.env.local`.
const cleared = [
  'NEXT_PUBLIC_ACCESS_TEAM_DOMAIN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_RELEASE',
]
const env: NodeJS.ProcessEnv = { ...process.env }
for (const key of cleared)
  env[key] = ''

const result = spawnSync('pnpm', ['exec', 'vinext', 'build'], {
  env,
  stdio: 'inherit',
  // Windows resolves pnpm through a shell; POSIX does not need one.
  shell: process.platform === 'win32',
})
if (result.error !== undefined)
  throw result.error
if (result.status !== 0)
  throw new Error(`The unsigned e2e build failed with status ${result.status}.`)
