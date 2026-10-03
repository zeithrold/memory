import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const reportSchema = z.object({
  checks: z.array(z.object({
    capability: z.string(),
    steps: z.array(z.object({
      status: z.string(),
      log: z.string().regex(/^logs\/[^/\\]+\.log$/).optional(),
    })).nullish().transform(value => value ?? []),
  })),
})

const root = '.zt/artifacts'
if (existsSync(root)) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('check-')) {
      showFailures(path.join(root, entry.name))
    }
  }
}

function showFailures(directory: string): void {
  const file = path.join(directory, 'report.json')
  if (!existsSync(file)) {
    return
  }
  const report = reportSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  for (const check of report.checks) {
    for (const step of check.steps) {
      if (step.status !== 'passed' && step.log !== undefined) {
        process.stdout.write(`::group::Failed ${check.capability}: ${step.log}\n`)
        process.stdout.write(`${readFileSync(path.join(directory, step.log), 'utf8')}\n::endgroup::\n`)
      }
    }
  }
}
