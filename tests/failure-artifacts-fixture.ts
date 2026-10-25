import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Synthetic Playwright report rows for the evidence-retention script. The real
 * recorder nests results as suites -> specs -> tests -> results, which is what
 * these builders reproduce.
 */
export const scanLabel = 'a11y-expected-button-name-failure'

function rule(id: string, nodes: number): Record<string, unknown> {
  return {
    id,
    impact: 'serious',
    description: `${id} description`,
    nodes: Array.from({ length: nodes }, () => ({ target: ['body > button'] })),
  }
}

/** A complete axe-core result: engine identity plus every rule array. */
export function completeScan(): string {
  return JSON.stringify({
    testEngine: { name: 'axe-core', version: '4.13.0' },
    testRunner: { name: 'axe' },
    passes: [
      rule('color-contrast', 1),
    ],
    violations: [
      rule('button-name', 1),
    ],
    incomplete: [
      rule('aria-allowed-attr', 0),
    ],
    inapplicable: [
      rule('video-caption', 0),
    ],
  })
}

export function failureReport(
  results: { status: string, attachments?: Record<string, string>[] }[],
): unknown {
  return {
    stats: { unexpected: 1, expected: 0 },
    suites: [
      {
        specs: [
          {
            tests: [
              {
                status: 'unexpected',
                results: results.map(entry => ({
                  status: entry.status,
                  attachments: (entry.attachments ?? []).map(attachment => ({
                    contentType: 'application/json',
                    ...attachment,
                  })),
                })),
              },
            ],
          },
        ],
      },
    ],
  }
}

/** A report whose single result failed, carrying only the given attachments. */
export function failedAttemptReport(attachments: Record<string, string>[]): unknown {
  return failureReport([
    { status: 'failed', attachments },
  ])
}

export function writeEvidence(root: string, name: string, body = 'evidence'): string {
  const file = join(root, name)
  writeFileSync(file, body)
  return file
}

/** Trace, screenshot and video files plus the attachments that record them. */
export function completeMedia(root: string): Record<string, string>[] {
  return [
    { name: 'trace', contentType: 'application/zip', path: writeEvidence(root, 'trace.zip') },
    { name: 'screenshot', contentType: 'image/png', path: writeEvidence(root, 'test-failed-1.png') },
    { name: 'video', contentType: 'video/webm', path: writeEvidence(root, 'video.webm') },
  ]
}
