import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'

const config = z.object({
  vars: z.object({ APP_ORIGIN: z.url() }),
  d1_databases: z.array(z.object({ database_id: z.string().uuid() })).min(1),
  vectorize: z.array(z.object({ binding: z.literal('VECTORIZE'), index_name: z.string().min(1) })).min(1),
  ai: z.object({ binding: z.literal('AI') }),
  // The catalog agent is useless without a scheduled Workflow, so a deployment
  // that dropped the binding fails here rather than silently never running.
  // `AGENT_SETTINGS_KEY` cannot be checked from configuration: it is a Worker
  // secret, and the runtime reports AGENT_KEY_UNCONFIGURED when it is missing.
  workflows: z.array(z.object({
    name: z.string().min(1),
    binding: z.literal('CATALOG_WORKFLOW'),
    class_name: z.literal('CatalogWorkflow'),
    schedules: z.array(z.string().min(1)).min(1),
  })).min(1),
}).parse(JSON.parse(readFileSync('wrangler.jsonc', 'utf8')))
if (config.vars.APP_ORIGIN.startsWith('http:') || config.vars.APP_ORIGIN.includes('localhost') || config.d1_databases.some(db => db.database_id === '00000000-0000-0000-0000-000000000000')) {
  throw new Error('Set a real HTTPS origin and D1 database ID before deployment. See docs/SETUP.md.')
}
if (existsSync('.env.local'))
  process.loadEnvFile('.env.local')
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')) {
  throw new Error('Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY before building. See docs/SETUP.md.')
}
