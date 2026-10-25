import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { failedAttempt, readAxeScan, verifyMediaEvidence, verifyReportPage } from '../scripts/failure-artifacts'
import {
  completeMedia,
  completeScan,
  failedAttemptReport,
  failureReport,
  scanLabel as label,
  writeEvidence,
} from './failure-artifacts-fixture'

let root = ''
let outside = ''
const scanFile = (): string => writeEvidence(root, 'axe.json', completeScan())

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'memory-failure-artifacts-'))
  outside = mkdtempSync(join(tmpdir(), 'memory-failure-outside-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

it('reads the complete engine result embedded by the published body attachment', () => {
  const scan = completeScan()
  const { scan: parsed, text } = readAxeScan(
    failedAttempt(failedAttemptReport([
      { name: label, body: btoa(scan) },
    ])),
    root,
  )
  expect(text).toBe(scan)
  expect(parsed.testEngine).toEqual({ name: 'axe-core', version: '4.13.0' })
  expect(parsed.violations.map(violation => violation.id)).toEqual(['button-name'])
  expect(parsed.inapplicable.map(result => result.id)).toEqual(['video-caption'])
})

it('reads the complete engine result from the file a path attachment records', () => {
  const { scan, text } = readAxeScan(
    failedAttempt(failedAttemptReport([
      { name: label, path: scanFile() },
    ])),
    root,
  )
  expect(text).toBe(completeScan())
  // The retained text keeps every engine array; the parsed projection is not evidence.
  for (const key of [
    'testEngine',
    'passes',
    'violations',
    'incomplete',
    'inapplicable',
  ]) {
    expect(text).toContain(`"${key}"`)
  }
  expect(scan.passes).toHaveLength(1)
})

it('resolves a relative attachment path inside this run directory', () => {
  mkdirSync(join(root, 'results'), { recursive: true })
  writeFileSync(join(root, 'results', 'axe.json'), completeScan())
  const { scan } = readAxeScan(
    failedAttempt(failedAttemptReport([
      { name: label, path: join('results', 'axe.json') },
    ])),
    root,
  )
  expect(scan.violations).toHaveLength(1)
})

it('accepts evidence nested inside this run directory', () => {
  mkdirSync(join(root, 'test-results', 'deliberate'), { recursive: true })
  writeFileSync(join(root, 'test-results', 'deliberate', 'axe.json'), completeScan())
  const { scan } = readAxeScan(
    failedAttempt(failedAttemptReport([
      { name: label, path: join('test-results', 'deliberate', 'axe.json') },
    ])),
    root,
  )
  expect(scan.testEngine.name).toBe('axe-core')
})

it('rejects a missing attachment, an unusable one, undecodable content and a missing file', () => {
  const kinds: { attachment: Record<string, string>, error: string }[] = [
    { attachment: { name: 'a11y-other', body: btoa(completeScan()) }, error: 'not attached to the failed attempt' },
    { attachment: { name: label }, error: 'neither an embedded body nor a file path' },
    { attachment: { name: label, body: 'not base64' }, error: 'not valid base64' },
    { attachment: { name: label, path: join(root, 'absent.json') }, error: 'evidence file is missing' },
  ]
  for (const kind of kinds) {
    expect(() => readAxeScan(failedAttempt(failedAttemptReport([kind.attachment])), root))
      .toThrow(kind.error)
  }
})

it('does not fall back when a recorded absolute path is missing', () => {
  writeFileSync(join(root, 'axe.json'), completeScan())
  expect(() => readAxeScan(
    failedAttempt(failedAttemptReport([
      { name: label, path: join(outside, 'axe.json') },
    ])),
    root,
  )).toThrow('evidence file is missing')
})

it('rejects relative and symlinked evidence that leaves this run directory', () => {
  const priorRun = join(outside, 'axe.json')
  writeFileSync(priorRun, completeScan())
  symlinkSync(priorRun, join(root, 'linked.json'))
  for (const path of [
    relative(root, priorRun),
    priorRun,
    'linked.json',
  ]) {
    expect(() => readAxeScan(failedAttempt(failedAttemptReport([
      { name: label, path },
    ])), root))
      .toThrow('evidence path escapes the run output directory')
  }
})

it('rejects a scan that is not a complete engine result', () => {
  const engine = { name: 'axe-core', version: '4.13.0' }
  const empty = { incomplete: [], inapplicable: [], passes: [], violations: [] }
  const partial = [
    JSON.stringify({ violations: [
      { id: 'button-name', nodes: [] },
    ] }),
    JSON.stringify(empty),
    JSON.stringify({ ...empty, testEngine: { name: 'axe-core', version: '' } }),
    JSON.stringify({ ...empty, testEngine: { name: 'other-scanner', version: '1.0.0' } }),
    JSON.stringify({ ...empty, testEngine: engine, violations: [
      { id: 'button-name' },
    ] }),
    JSON.stringify({ ...empty, testEngine: engine, inapplicable: undefined }),
  ]
  for (const text of partial) {
    expect(() => readAxeScan(failedAttempt(failedAttemptReport([
      { name: label, body: btoa(text) },
    ])), root))
      .toThrow('not a complete Axe result')
  }
})

it('refuses evidence held by a passing sibling instead of the failed attempt', () => {
  const sibling = failureReport([
    { status: 'passed', attachments: [
      { name: label, body: btoa(completeScan()) },
      ...completeMedia(root),
    ] },
    { status: 'failed', attachments: [] },
  ])
  const attempt = failedAttempt(sibling)
  expect(attempt.attachments).toEqual([])
  expect(() => verifyMediaEvidence(attempt, root)).toThrow('Missing failure evidence')
  expect(() => readAxeScan(attempt, root)).toThrow('not attached to the failed attempt')
})

it('requires exactly one failed attempt', () => {
  expect(() => failedAttempt(failureReport([
    { status: 'passed', attachments: [] },
  ])))
    .toThrow('must record exactly one failed attempt; found 0')
  expect(() => failedAttempt(failureReport([
    { status: 'failed' },
    { status: 'failed', attachments: [] },
  ])))
    .toThrow('must record exactly one failed attempt; found 2')
})

it('takes trace, screenshot and video from the failed attempt only', () => {
  const scan = { name: label, body: btoa(completeScan()) }
  expect(() => verifyMediaEvidence(
    failedAttempt(failedAttemptReport([
      scan,
      ...completeMedia(root),
    ])),
    root,
  )).not.toThrow()
  for (const missing of [
    'trace',
    'screenshot',
    'video',
  ]) {
    const kept = completeMedia(root).filter(entry => entry.name !== missing)
    expect(() => verifyMediaEvidence(failedAttempt(failedAttemptReport([
      scan,
      ...kept,
    ])), root))
      .toThrow(`no ${missing} attachment`)
  }
})

it('rejects inherited media that is empty, mistyped or outside this run', () => {
  const scan = { name: label, body: btoa(completeScan()) }
  expect(() => verifyMediaEvidence(
    failedAttempt(failedAttemptReport([
      scan,
      ...completeMedia(root).map(entry => (entry.name === 'trace'
        ? { ...entry, path: writeEvidence(root, 'trace.txt') }
        : entry)),
    ])),
    root,
  )).toThrow('is not a .zip file')
  writeFileSync(join(root, 'empty.webm'), '')
  expect(() => verifyMediaEvidence(
    failedAttempt(failedAttemptReport([
      scan,
      ...completeMedia(root).map(entry => (entry.name === 'video'
        ? { ...entry, path: join(root, 'empty.webm') }
        : entry)),
    ])),
    root,
  )).toThrow('evidence file is empty')
  writeFileSync(join(outside, 'trace.zip'), 'evidence')
  expect(() => verifyMediaEvidence(
    failedAttempt(failedAttemptReport([
      scan,
      ...completeMedia(root).map(entry => (entry.name === 'trace'
        ? { ...entry, path: join(outside, 'trace.zip') }
        : entry)),
    ])),
    root,
  )).toThrow('evidence path escapes the run output directory')
})

it('requires the HTML report to exist and belong to this run', () => {
  expect(() => verifyReportPage(root, '2026-10-25T07:00:00.000Z')).toThrow('Missing failure evidence')
  mkdirSync(join(root, 'playwright-report'), { recursive: true })
  const page = join(root, 'playwright-report', 'index.html')
  writeFileSync(page, '<!doctype html><title>report</title>')
  const now = new Date()
  expect(() => verifyReportPage(root, now.toISOString())).not.toThrow()
  const stale = new Date(now.getTime() - 3_600_000)
  utimesSync(page, stale, stale)
  expect(() => verifyReportPage(root, now.toISOString())).toThrow('predates this run')
  expect(() => verifyReportPage(root, 'not-a-timestamp')).toThrow('not a timestamp')
})
