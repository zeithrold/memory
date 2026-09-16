import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// Assembles the portable plugin package (manifest + MCP wiring + skill) from the
// checked-in sources, so the skill has one home and the MCP URL is read from the
// deployment configuration instead of being duplicated.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const manifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    extensions: z
      .object({
        'com.openai': z
          .object({ interface: z.record(z.string(), z.unknown()) })
          .partial(),
      })
      .partial()
      .optional(),
  })
  .loose()

export interface BuildPluginOptions {
  origin: string
  outDir?: string
  root?: string
}

export interface BuiltPlugin {
  directory: string
  marketplace: string
  origin: string
}
export function buildPlugin(options: BuildPluginOptions): BuiltPlugin {
  const base = options.root ?? root
  const origin = options.origin.replace(/\/+$/, '')
  const out = path.resolve(options.outDir ?? path.join(base, 'dist/plugin'))
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(path.join(base, 'plugin/plugin.json'), 'utf8')),
  )
  const directory = path.join(out, manifest.name)
  manifest.extensions ??= {}
  manifest.extensions['com.openai'] ??= {}
  manifest.extensions['com.openai'].interface ??= {}
  manifest.extensions['com.openai'].interface.websiteURL = origin
  const skill = path.join(base, 'skills/shared-memory')
  if (!existsSync(path.join(skill, 'SKILL.md')))
    throw new Error(`Missing skills/shared-memory/SKILL.md under ${base}.`)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(path.join(directory, 'skills'), { recursive: true })
  writeFileSync(
    path.join(directory, 'plugin.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  writeFileSync(
    path.join(directory, 'mcp.json'),
    `${JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: {
          shared_memory: {
            type: 'streamable-http',
            url: `${origin}/mcp`,
          },
        },
      },
      null,
      2,
    )}\n`,
  )
  cpSync(skill, path.join(directory, 'skills/shared-memory'), {
    recursive: true,
  })
  const marketplace = path.join(out, 'marketplace.json')
  const published = manifest.extensions['com.openai'].interface.displayName
  const displayName
    = typeof published === 'string' && published.length > 0 ? published : manifest.name
  writeFileSync(
    marketplace,
    `${JSON.stringify(
      {
        name: `${manifest.name}-local`,
        interface: {
          displayName: `${displayName} (local)`,
        },
        plugins: [
          {
            name: manifest.name,
            source: { source: 'local', path: `./${manifest.name}` },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Productivity',
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  return { directory, marketplace, origin }
}
export function configuredOrigin(base = root): string {
  const config = z
    .object({ vars: z.object({ APP_ORIGIN: z.url() }) })
    .parse(JSON.parse(readFileSync(path.join(base, 'wrangler.jsonc'), 'utf8')))
  return config.vars.APP_ORIGIN
}
function assertDeployableOrigin(origin: string): void {
  if (origin.startsWith('http:') || origin.includes('localhost')) {
    throw new Error(
      `The MCP endpoint must be a public HTTPS origin, got ${origin}. Pass --origin=https://your-host.`,
    )
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv.find(argument => argument.startsWith('--origin='))
  const origin = flag?.slice('--origin='.length) ?? configuredOrigin()
  assertDeployableOrigin(origin)
  const built = buildPlugin({ origin })
  process.stdout.write(`Plugin written to ${built.directory}\n`)
  process.stdout.write(`Marketplace written to ${built.marketplace}\n`)
}
