import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

const sourceFileSchema = z.object({
  path: z.string().regex(/^components\/ui\/ztd-me\/(?!.*\.\.)[\w@./-]+$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})
const receiptSchema = z.object({
  schemaVersion: z.literal(1),
  item: z.literal('@ztd-me/ui'),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
  registryUrl: z.url(),
  cli: z.literal('shadcn@4.21.1'),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  dependencies: z.array(z.string()),
  files: z.array(sourceFileSchema),
  adaptations: z.array(sourceFileSchema.extend({ reason: z.string().trim().min(1) })),
})
const packageSchema = z.object({ dependencies: z.record(z.string(), z.string()) })

function assertUniquePaths(files: z.infer<typeof sourceFileSchema>[]): void {
  if (new Set(files.map(file => file.path)).size !== files.length) {
    throw new Error('Duplicate UI source or adaptation paths')
  }
}

export function verifyUiSource(): z.infer<typeof receiptSchema> {
  const receipt = receiptSchema.parse(JSON.parse(readFileSync('ui-source.lock.json', 'utf8')))
  const config = z.object({ registries: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync('components.json', 'utf8')))
  assert.strictEqual(config.registries['@ztd-me']?.replace('{name}', 'ui'), receipt.registryUrl)
  if (receipt.registryUrl !== `https://raw.githubusercontent.com/zeithrold/tools/${receipt.sourceSha}/registry/ui.json`) {
    throw new Error('UI registry URL does not match its source SHA')
  }
  assert.strictEqual(receipt.files.length, 42)
  assertUniquePaths(receipt.files)
  assertUniquePaths(receipt.adaptations)
  for (const adaptation of receipt.adaptations) {
    const source = receipt.files.find(file => file.path === adaptation.path)
    assert.ok(source !== undefined, `Adaptation is absent from upstream source: ${adaptation.path}`)
    assert.notStrictEqual(adaptation.sha256, source.sha256)
  }
  for (const file of receipt.files) {
    const expected = receipt.adaptations.find(adaptation => adaptation.path === file.path)?.sha256 ?? file.sha256
    const actual = createHash('sha256').update(readFileSync(file.path)).digest('hex')
    if (actual !== expected) {
      throw new Error(`Review and record deliberate UI source changes: ${file.path}`)
    }
  }
  const packageInfo = packageSchema.parse(JSON.parse(readFileSync('package.json', 'utf8')))
  assert.strictEqual(packageInfo.dependencies['@ztd-me/frontend'], undefined)
  for (const dependency of receipt.dependencies) {
    const separator = dependency.lastIndexOf('@')
    assert.strictEqual(packageInfo.dependencies[dependency.slice(0, separator)], dependency.slice(separator + 1))
  }
  return receipt
}
