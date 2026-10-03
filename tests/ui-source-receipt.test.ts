import { execFileSync } from 'node:child_process'
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
  for (const file of ['components.json', 'package.json']) {
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

it('accepts the recorded README adaptation while preserving original upstream hashes', () => {
  expect(receipt.adaptations).toHaveLength(1)
  expect(receipt.adaptations[0]?.path).toBe('components/ui/ztd-me/README.md')
  expect(() => verify()).not.toThrow()
})

it('rejects an unrecorded README change', () => {
  receipt.adaptations = []
  expect(() => verify()).toThrow('Review and record deliberate UI source changes')
})

it('rejects additional source edits even when the README adaptation is accepted', () => {
  writeFileSync(join(root, 'components/ui/ztd-me/client.ts'), 'export {}\n')
  expect(() => verify()).toThrow('Review and record deliberate UI source changes')
})

it('rejects a recorded adaptation whose actual bytes no longer match', () => {
  writeFileSync(join(root, 'components/ui/ztd-me/README.md'), '# Unexpected change\n')
  expect(() => verify()).toThrow('Review and record deliberate UI source changes')
})

it('rejects duplicate adaptations', () => {
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
