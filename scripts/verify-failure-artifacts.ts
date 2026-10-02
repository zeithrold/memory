import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const root = '.zt/artifacts/failure-probe'
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const reportSchema = z.object({ stats: z.object({ unexpected: z.number(), expected: z.number() }) })
const axeSchema = z.object({ violations: z.array(z.object({ id: z.string() })) })
const attachmentSchema = z.object({ name: z.string(), contentType: z.string(), body: z.string().optional() })
function attachments(value: unknown): z.infer<typeof attachmentSchema>[] {
  const object = z.record(z.string(), z.unknown()).safeParse(value)
  if (object.success) {
    const own = z.array(attachmentSchema).safeParse(object.data.attachments)
    return [
      ...(own.success ? own.data : []),
      ...Object.values(object.data).flatMap(attachments),
    ]
  }
  const array = z.array(z.unknown()).safeParse(value)
  return array.success ? array.data.flatMap(attachments) : []
}
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
const retained = files(root)
for (const suffix of [
  '/trace.zip',
  '/test-failed-1.png',
  '.webm',
  '/playwright-report/index.html',
]) {
  if (!retained.some(path => path.endsWith(suffix))) {
    throw new Error(`Missing failure evidence: ${suffix}`)
  }
}
const scan = attachments(raw).find(attachment => attachment.name === 'a11y-expected-button-name-failure')
if (scan?.body === undefined) {
  throw new Error('The complete Axe scan was not attached to the JSON report.')
}
const data = new TextDecoder().decode(Uint8Array.from(atob(scan.body), character => character.charCodeAt(0)))
const axe = axeSchema.parse(JSON.parse(data))
if (!axe.violations.some(violation => violation.id === 'button-name')) {
  throw new Error('The failure was not the deliberate Axe button-name violation.')
}
writeFileSync(`${root}/axe.json`, data)
process.stdout.write('Expected Axe failure verified; full scan, HTML/JSON, trace, screenshot and video retained.\n')
