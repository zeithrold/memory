import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { TENANT_INTEGRITY_QUERIES } from '../lib/server/tenant-integrity'

const mode = process.argv.includes('--remote') ? '--remote' : '--local'
const findings = TENANT_INTEGRITY_QUERIES.flatMap((query) => {
  const output = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', mode, '--json', '--command', query],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const parsed = JSON.parse(output) as { results?: { relationship: string, count: number, sample_id: string }[] }[]
  return parsed.flatMap(batch => batch.results ?? [])
})
if (findings.length === 0) {
  console.warn(`Tenant integrity check passed (${mode.slice(2)}).`)
}
else {
  console.error('Tenant integrity violations found; no data was changed.')
  console.error(JSON.stringify(findings, null, 2))
  process.exitCode = 1
}
