import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildPlugin, configuredOrigin } from '../scripts/build-plugin'

// The plugin must not be able to drift from the deployed MCP origin, and the
// skill must ship inside the package rather than being copied by hand.
const out = mkdtempSync(path.join(tmpdir(), 'shared-memory-plugin-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

describe('plugin package', () => {
  it('reads the MCP origin from the deployment configuration', () => {
    expect(configuredOrigin()).toMatch(/^https:\/\//)
  })
  it('assembles the manifest, MCP wiring, skill and marketplace', () => {
    const built = buildPlugin({ origin: 'https://memory.example/', outDir: out })
    expect(built.directory).toBe(path.join(out, 'shared-memory'))
    const manifest = z
      .object({
        name: z.string(),
        version: z.string(),
        extensions: z.object({
          'com.openai': z.object({
            interface: z.object({ websiteURL: z.string() }),
          }),
        }),
      })
      .loose()
      .parse(JSON.parse(readFileSync(path.join(built.directory, 'plugin.json'), 'utf8')))
    expect(manifest.name).toBe('shared-memory')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.extensions['com.openai'].interface.websiteURL).toBe(
      'https://memory.example',
    )
    const wiring = z
      .object({
        mcpServers: z.object({
          shared_memory: z.object({ type: z.string(), url: z.string() }),
        }),
      })
      .parse(JSON.parse(readFileSync(path.join(built.directory, 'mcp.json'), 'utf8')))
    expect(wiring.mcpServers.shared_memory).toEqual({
      type: 'streamable-http',
      url: 'https://memory.example/mcp',
    })
    expect(
      existsSync(path.join(built.directory, 'skills/shared-memory/SKILL.md')),
    ).toBe(true)
    expect(
      existsSync(path.join(built.directory, 'skills/shared-memory/references/api.md')),
    ).toBe(true)
    expect(
      existsSync(path.join(built.directory, 'skills/shared-memory/scripts/configure.mjs')),
    ).toBe(true)
    expect(
      readFileSync(path.join(built.directory, 'skills/shared-memory/SKILL.md'), 'utf8'),
    ).toContain('Run the automatic capture pass')
    const marketplace = z
      .object({
        plugins: z.array(
          z.object({
            name: z.string(),
            source: z.object({ source: z.string(), path: z.string() }),
            policy: z.object({ installation: z.string(), authentication: z.string() }),
            category: z.string(),
          }),
        ),
      })
      .parse(JSON.parse(readFileSync(built.marketplace, 'utf8')))
    expect(marketplace.plugins).toEqual([
      {
        name: 'shared-memory',
        source: { source: 'local', path: './shared-memory' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ])
  })
})
