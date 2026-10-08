import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { verifyUiSource } from '../scripts/verify-ui-source'

type Receipt = ReturnType<typeof verifyUiSource>
const script = fileURLToPath(new URL('../scripts/verify-ui-source.ts', import.meta.url))
const registration = import.meta.resolve('tsx')
let root: string
let receipt: Receipt

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'memory-ui-receipt-'))
  receipt = verifyUiSource()
  for (const file of receipt.files) {
    const target = join(root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(file.path))
  }
  for (const file of [
    'components.json',
    'package.json',
    'docs/ui-public-installation.json',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), readFileSync(file))
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function verify(): void {
  writeFileSync(join(root, 'ui-source.lock.json'), JSON.stringify(receipt))
  execFileSync(process.execPath, [
    '--import',
    registration,
    '--input-type=module',
    '--eval',
    `import { verifyUiSource } from ${JSON.stringify(script)}; verifyUiSource()`,
  ], { cwd: root, stdio: 'pipe' })
}

it('accepts all 77 public source files with the genuine verified installation receipt', () => {
  expect(receipt.files).toHaveLength(77)
  expect(receipt.installation.files).toHaveLength(77)
  expect(receipt.installation.publicInstallationVerified).toBe(true)
  expect(receipt.adaptations).toHaveLength(0)
  expect(() => verify()).not.toThrow()
})

function adaptReadme(): void {
  const filename = 'components/ui/ztd-me/README.md'
  writeFileSync(join(root, filename), '# Reviewed consumer documentation\n')
  const sha256 = createHash('sha256').update(readFileSync(join(root, filename))).digest('hex')
  const reason = 'Reviewed consumer documentation example'
  receipt.adaptations.push({ path: filename, sha256, reason })
  const entry = receipt.installation.files.find(file => file.path === filename)
  if (entry === undefined) {
    throw new Error('README must be in the public inventory')
  }
  entry.sha256 = sha256
  entry.adaptation = reason
  const inventory = JSON.stringify(receipt.installation.files)
  receipt.installation.inventorySha256 = createHash('sha256').update(inventory).digest('hex')
}

it('rejects an unrecorded README change', () => {
  const file = join(root, 'components/ui/ztd-me/README.md')
  const original = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, `${original}\nUnrecorded documentation edit.\n`)
    expect(() => verify()).toThrow('Unreviewed public source change')
  }
  finally {
    writeFileSync(file, original)
  }
})

it('rejects additional source edits even when the README adaptation is accepted', () => {
  adaptReadme()
  expect(() => verify()).not.toThrow()
  writeFileSync(join(root, 'components/ui/ztd-me/client.ts'), 'export {}\n')
  expect(() => verify()).toThrow('Unreviewed public source change')
})

it('rejects a recorded adaptation whose actual bytes no longer match', () => {
  adaptReadme()
  writeFileSync(join(root, 'components/ui/ztd-me/README.md'), '# Unexpected change\n')
  expect(() => verify()).toThrow('Unreviewed public source change')
})

it('rejects duplicate adaptations', () => {
  adaptReadme()
  receipt.adaptations.push(...receipt.adaptations)
  expect(() => verify()).toThrow('Duplicate UI source or adaptation paths')
})

it('rejects adaptations outside the original upstream source inventory', () => {
  receipt.adaptations.push({
    path: 'components/ui/ztd-me/unknown.ts',
    sha256: 'a'.repeat(64),
    reason: 'Unknown source file',
  })
  expect(() => verify()).toThrow('Adaptation is absent from upstream source')
})

it('rejects an extra installed source file beyond the public source inventory', () => {
  writeFileSync(join(root, 'components/ui/ztd-me/unreviewed.txt'), 'Unreviewed source\n')
  expect(() => verify()).toThrow('Public source must be installed atomically')
})

it('rejects changes to the public inventory digest', () => {
  receipt.installation.inventorySha256 = '0'.repeat(64)
  expect(() => verify()).toThrow('Public inventory changed without review')
})

it('rejects modified CI installation evidence', () => {
  writeFileSync(join(root, 'docs/ui-public-installation.json'), '{}\n')
  expect(() => verify()).toThrow('Public CI receipt changed')
})
