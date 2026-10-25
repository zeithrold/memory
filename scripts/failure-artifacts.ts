import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'

/**
 * `@ztd-me/frontend-checks` attaches the complete Axe scan as evidence. The
 * published 0.1.3 helper embeds it in the JSON report as a base64 `body`; a newer
 * helper keeps the same `assertAccessible`/`captureState` signatures but attaches
 * the complete file instead, so the report records its copy as `path`. Both
 * shapes must carry the whole engine result, so neither form can satisfy the
 * check with a summary or partial projection.
 */
const attachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  body: z.string().optional(),
  path: z.string().optional(),
})
export type ReportAttachment = z.infer<typeof attachmentSchema>

const ruleResultSchema = z.object({
  id: z.string().min(1),
  nodes: z.array(z.unknown()),
})
const axeSchema = z.object({
  testEngine: z.object({
    name: z.literal('axe-core'),
    version: z.string().min(1),
  }),
  passes: z.array(ruleResultSchema),
  violations: z.array(ruleResultSchema),
  incomplete: z.array(ruleResultSchema),
  inapplicable: z.array(ruleResultSchema),
})
export type AxeScan = z.infer<typeof axeSchema>

export const reportSchema = z.object({
  stats: z.object({
    unexpected: z.number(),
    expected: z.number(),
    startTime: z.string().optional(),
  }),
})

const resultSchema = z.object({
  status: z.string(),
  attachments: z.array(attachmentSchema).optional().default([]),
})

/** One attempt's attachments; the deliberate probe must supply exactly one failed attempt. */
export type EvidenceAttempt = { status: string, attachments: ReportAttachment[] }

function walkResults(value: unknown, visit: (result: EvidenceAttempt) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkResults(item, visit)
    }
    return
  }
  if (typeof value !== 'object' || value === null) {
    return
  }
  const record = z.record(z.string(), z.unknown()).parse(value)
  if (Array.isArray(record.results)) {
    for (const result of record.results) {
      const parsed = resultSchema.safeParse(result)
      if (parsed.success) {
        visit({ status: parsed.data.status, attachments: parsed.data.attachments })
      }
    }
  }
  for (const key of [
    'suites',
    'specs',
    'tests',
  ]) {
    const children = record[key]
    if (Array.isArray(children)) {
      walkResults(children, visit)
    }
  }
}

/**
 * A passing sibling, an older run or any other file under the artifact root must
 * never lend evidence to the deliberate failure, so every read starts here.
 */
export function failedAttempt(report: unknown): EvidenceAttempt {
  const found: EvidenceAttempt[] = []
  walkResults(report, (result) => {
    if (result.status === 'failed') {
      found.push(result)
    }
  })
  const [only] = found
  if (found.length !== 1 || only === undefined) {
    throw new Error(
      `The deliberate failure probe must record exactly one failed attempt; found ${found.length}.`,
    )
  }
  return only
}

function runDirectory(root: string): string {
  try {
    return realpathSync(root)
  }
  catch {
    throw new Error(`The failure evidence directory is missing: ${root}`)
  }
}

/**
 * Absolute paths are used as recorded, never retried against the run directory.
 * Relative paths resolve only inside this run, and the resolved real path must
 * stay there too, so `../old-run` and symlinks cannot reach other evidence.
 */
function evidenceFile(root: string, attachment: ReportAttachment, extension?: string): string {
  const recorded = attachment.path
  if (recorded === undefined) {
    throw new Error(`The ${attachment.name} attachment records no file path.`)
  }
  const directory = runDirectory(root)
  const candidate = isAbsolute(recorded) ? recorded : resolve(root, recorded)
  let file: string
  try {
    file = realpathSync(candidate)
  }
  catch {
    throw new Error(`The ${attachment.name} evidence file is missing: ${candidate}`)
  }
  const relation = relative(directory, file)
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`The ${attachment.name} evidence path escapes the run output directory: ${recorded}`)
  }
  if (extension !== undefined && !file.endsWith(extension)) {
    throw new Error(`The ${attachment.name} evidence file is not a ${extension} file: ${recorded}`)
  }
  if (statSync(file).size === 0) {
    throw new Error(`The ${attachment.name} evidence file is empty: ${recorded}`)
  }
  return file
}

const media = [
  { contentType: 'application/zip', extension: '.zip', name: 'trace' },
  { contentType: 'image/png', extension: '.png', name: 'screenshot' },
  { contentType: 'video/webm', extension: '.webm', name: 'video' },
] as const

/** Trace, screenshot and video must belong to the failed attempt itself. */
export function verifyMediaEvidence(attempt: EvidenceAttempt, root: string): void {
  for (const expected of media) {
    const attachment = attempt.attachments.find(
      candidate => candidate.name === expected.name && candidate.contentType === expected.contentType,
    )
    if (attachment === undefined) {
      throw new Error(`Missing failure evidence: no ${expected.name} attachment on the failed attempt.`)
    }
    evidenceFile(root, attachment, expected.extension)
  }
}

// Filesystem timestamps are coarse, so a fresh page is allowed to look slightly
// older than the recorded start.
const clockToleranceMs = 5000

/** The HTML report is aggregate evidence, so it must at least belong to this run. */
export function verifyReportPage(root: string, startTime?: string): void {
  const page = join(root, 'playwright-report', 'index.html')
  if (!existsSync(page)) {
    throw new Error(`Missing failure evidence: ${page}.`)
  }
  if (startTime === undefined) {
    return
  }
  const started = Date.parse(startTime)
  if (Number.isNaN(started)) {
    throw new TypeError(`The failure report start time is not a timestamp: ${startTime}`)
  }
  if (statSync(page).mtimeMs < started - clockToleranceMs) {
    throw new Error(`The retained HTML report predates this run: ${page}`)
  }
}

// Preserved verbatim for the retained `axe.json`; a body that Playwright cannot
// have produced must fail loudly rather than through a decoder exception.
function decodeBody(attachment: ReportAttachment): string {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(attachment.body ?? ''), character => character.charCodeAt(0)),
    )
  }
  catch {
    throw new Error(`The ${attachment.name} attachment body is not valid base64.`)
  }
}

/** Read the complete scan, never a summary of it. */
export function readAxeScan(
  attempt: EvidenceAttempt,
  root: string,
  name = 'a11y-expected-button-name-failure',
): { scan: AxeScan, text: string } {
  const attachment = attempt.attachments.find(candidate => candidate.name === name)
  if (attachment === undefined) {
    throw new Error('The complete Axe scan was not attached to the failed attempt.')
  }
  let text: string
  if (attachment.body !== undefined) {
    text = decodeBody(attachment)
  }
  else if (attachment.path !== undefined) {
    text = readFileSync(evidenceFile(root, attachment), 'utf8')
  }
  else {
    throw new Error(
      `The ${attachment.name} attachment records neither an embedded body nor a file path.`,
    )
  }
  try {
    return { scan: axeSchema.parse(JSON.parse(text)), text }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : 'the content could not be read'
    throw new Error(`The Axe attachment is not a complete Axe result: ${reason}`)
  }
}
