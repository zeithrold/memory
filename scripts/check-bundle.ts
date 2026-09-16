import { readFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'

/**
 * Workflows and Durable Objects bind by *exported class name*, so the class has
 * to survive the production bundle as a named export of the entry module.
 *
 * This is asserted against the built artifact rather than the source because
 * the toolchain has silently dropped exports before: `vite.config.ts` disables
 * tree-shaking for the client and SSR environments precisely because an earlier
 * vinext/Vite build removed the application's client-boundary exports. A
 * regression here would deploy a Worker whose workflow cannot bind, which the
 * build itself would not report.
 */
const config = z
  .object({
    workflows: z
      .array(
        z.object({
          name: z.string().min(1),
          binding: z.string().min(1),
          class_name: z.string().min(1),
          schedules: z.array(z.string().min(1)).optional(),
        }),
      )
      .default([]),
  })
  .parse(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')))

if (config.workflows.length === 0)
  throw new Error('The built configuration declares no Workflow; see wrangler.jsonc.')

const entry = readFileSync('dist/server/index.js', 'utf8')
// The bundle emits `export{localName as ExportedName,…}`; collect the public
// names from every export statement so a chunk split cannot hide one.
const exported = new Set(
  [...entry.matchAll(/export\{([^}]*)\}/g)].flatMap(match =>
    (match[1] ?? '')
      .split(',')
      .map(part => part.trim().split(/\s+as\s+/).pop())
      .filter((name): name is string => name !== undefined && name.length > 0),
  ),
)

for (const workflow of config.workflows) {
  if (!exported.has(workflow.class_name)) {
    throw new Error(
      `The built entry does not export ${workflow.class_name}, so the Workflow "${workflow.name}" bound as ${workflow.binding} would fail to deploy. Re-export the class from worker.ts.`,
    )
  }
}

const summary = config.workflows
  .map(workflow =>
    `${workflow.name} (${workflow.class_name}, ${workflow.schedules?.join(' ') ?? 'no schedule'})`)
  .join(', ')
process.stdout.write(`Bundle exports every Workflow class: ${summary}\n`)
