import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import {
  failedAttempt,
  readAxeScan,
  reportSchema,
  verifyMediaEvidence,
  verifyReportPage,
} from './failure-artifacts'

const root = '.zt/artifacts/failure-probe'
const result = spawnSync('pnpm', [
  'exec',
  'playwright',
  'test',
  '--config',
  'playwright.evidence.config.ts',
], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.error !== undefined) {
  throw result.error
}
if (result.status !== 1) {
  throw new Error(`The deliberate failure must exit 1, received ${result.status ?? 'unknown'}.`)
}
const raw: unknown = JSON.parse(readFileSync(`${root}/playwright.json`, 'utf8'))
const report = reportSchema.parse(raw)
if (report.stats.unexpected !== 1 || report.stats.expected !== 0) {
  throw new Error('The failure probe did not produce exactly one failing test.')
}
// Aggregate HTML report, then the failed attempt's own trace, screenshot and
// video: a sibling result or a file left by another run must not lend evidence.
verifyReportPage(root, report.stats.startTime)
const attempt = failedAttempt(raw)
verifyMediaEvidence(attempt, root)
const { scan, text } = readAxeScan(attempt, root)
if (!scan.violations.some(violation => violation.id === 'button-name' && violation.nodes.length > 0)) {
  throw new Error('The failure was not the deliberate Axe button-name violation.')
}
writeFileSync(`${root}/axe.json`, text)
process.stdout.write(
  'Expected Axe failure verified; complete engine scan from the failed attempt '
  + 'plus HTML/JSON, trace, screenshot and video retained.\n',
)
