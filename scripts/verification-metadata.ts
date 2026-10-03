import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'

const versionSchema = z.object({ version: z.string() })
function version(name: string): string {
  return versionSchema.parse(JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'))).version
}
function hash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
const root = '.zt/artifacts'
mkdirSync(root, { recursive: true })
const metadata = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', [
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ], { encoding: 'utf8' }).length > 0,
  ciHead: process.env.MEMORY_SOURCE_REVISION ?? null,
  node: process.version,
  pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  zt: execFileSync('zt', ['version'], { encoding: 'utf8' }).trim(),
  toolsSource: '3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f',
  frontendSource: 'de4ec8fdab86c40789fdf02b82601350a12e111d',
  packages: Object.fromEntries([
    '@ztd-me/eslint',
    '@ztd-me/frontend',
    '@ztd-me/frontend-checks',
    '@playwright/test',
    'playwright-core',
  ].map(name => [
    name,
    version(name),
  ])),
  lockfileSha256: hash('pnpm-lock.yaml'),
  skillsLockSha256: hash('zt.lock.json'),
}
writeFileSync(`${root}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`)
