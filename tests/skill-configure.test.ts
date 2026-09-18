import type { AddressInfo } from 'node:net'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const script = path.resolve('skills/shared-memory/scripts/configure.mjs')
const temporaryDirectories: string[] = []

async function temporaryConfig() {
  const directory = await mkdtemp(path.join(tmpdir(), 'shared-memory-configure-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'nested', 'credentials.json')
}

async function statusServer(ready = true) {
  const authorizations: Array<string | undefined> = []
  const server = createServer((request, response) => {
    authorizations.push(request.headers.authorization)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      endpoint: 'ignored-by-client',
      mcpUrl: request.headers.authorization,
      credential: {
        ready,
        scopes: ready
          ? ['memory:read', 'memory:write', request.headers.authorization]
          : ['memory:read'],
        missingScopes: ready ? [] : ['memory:write'],
        project: 'global',
      },
    }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    authorizations,
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async directory => rm(directory, { recursive: true, force: true })))
})

describe('shared-memory credential helper', () => {
  it('validates and stores endpoint plus token without printing the secret', async () => {
    const service = await statusServer()
    const config = await temporaryConfig()
    const secret = 'mem_test_secret'
    try {
      const configured = await execFileAsync(process.execPath, [
        script,
        '--endpoint',
        service.origin,
        '--config',
        config,
      ], { env: { ...process.env, MEMORY_API_TOKEN: secret } })
      expect(configured.stdout).toContain(`Credential ready for ${service.origin}`)
      expect(configured.stdout).not.toContain(secret)
      expect(configured.stderr).not.toContain(secret)
      expect(service.authorizations).toEqual([`Bearer ${secret}`])
      expect(JSON.parse(await readFile(config, 'utf8'))).toEqual({
        version: 1,
        endpoint: service.origin,
        token: secret,
      })
      expect((await stat(config)).mode & 0o777).toBe(0o600)

      const environment = { ...process.env }
      delete environment.MEMORY_API_TOKEN
      const checked = await execFileAsync(process.execPath, [
        script,
        '--check',
        '--json',
        '--config',
        config,
      ], { env: environment })
      expect(JSON.parse(checked.stdout)).toEqual({
        endpoint: service.origin,
        mcpUrl: `${service.origin}/mcp`,
        credential: {
          ready: true,
          scopes: ['memory:read', 'memory:write'],
          missingScopes: [],
          project: 'global',
        },
      })
      expect(checked.stdout).not.toContain(secret)
      expect(service.authorizations).toEqual([`Bearer ${secret}`, `Bearer ${secret}`])

      const launched = await execFileAsync(process.execPath, [
        script,
        '--config',
        config,
        '--run',
        '--',
        process.execPath,
        '-e',
        'process.stdout.write(JSON.stringify({ endpoint: process.env.MEMORY_API_ENDPOINT, tokenLength: process.env.MEMORY_API_TOKEN?.length }))',
      ], { env: environment })
      expect(launched.stdout).toContain(`"endpoint":"${service.origin}"`)
      expect(launched.stdout).toContain(`"tokenLength":${secret.length}`)
      expect(launched.stdout).not.toContain(secret)
      expect(service.authorizations).toEqual([
        `Bearer ${secret}`,
        `Bearer ${secret}`,
        `Bearer ${secret}`,
      ])
    }
    finally {
      await service.close()
    }
  })

  it('does not save a credential that cannot perform automatic capture', async () => {
    const service = await statusServer(false)
    const config = await temporaryConfig()
    try {
      try {
        await execFileAsync(process.execPath, [
          script,
          '--endpoint',
          service.origin,
          '--config',
          config,
        ], { env: { ...process.env, MEMORY_API_TOKEN: 'mem_read_only' } })
        expect.fail('Read-only credential should be rejected.')
      }
      catch (error) {
        const failure = error as Error & { code?: number, stderr?: string }
        expect(failure.code).toBe(1)
        expect(failure.stderr).toContain('missing scopes: memory:write')
      }
      expect(existsSync(config)).toBe(false)
    }
    finally {
      await service.close()
    }
  })
})
