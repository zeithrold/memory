import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u)
export const installationSchema = z.object({
  kind: z.literal('verified-public-source'),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
  registryItemSha256: sha256,
  inventorySha256: sha256,
  publicInstallationVerified: z.literal(true),
  dependencies: z.array(z.string()),
  files: z.array(z.object({
    path: z.string().regex(/^components\/ui\/ztd-me\/(?!.*\.\.)[\w@./-]+$/u),
    upstreamSha256: sha256,
    sha256,
    adaptation: z.string().trim().min(1).optional(),
  })).length(77),
  verification: z.object({
    ciUrl: z.url(),
    artifactName: z.string(),
    receiptPath: z.literal('docs/ui-public-installation.json'),
    receiptSha256: sha256,
  }),
})
const publicReceiptSchema = z.object({
  sourceSha: z.string(),
  payloadSha256: sha256,
  publicInstallationVerified: z.literal(true),
  fontVerification: z.literal('google-fonts-api'),
  cssVerification: z.literal('published-checker'),
  requiredUiPackage: z.literal(false),
  cli: z.literal('shadcn@4.21.1'),
  registryUrl: z.url(),
  dependencies: z.array(z.string()),
  files: z.array(z.object({ installed: z.string(), sha256 })).length(77),
})
type Installation = z.infer<typeof installationSchema>
export function verifyInstallation(installation: Installation, dependencies: Record<string, string>): void {
  assert.ok(
    Object.is(installation.kind, 'verified-public-source'),
  )
  assert.ok(
    Object.is(installation.publicInstallationVerified, true),
  )
  assert.match(installation.sourceSha, /^[a-f0-9]{40}$/u)
  assert.match(installation.registryItemSha256, /^[a-f0-9]{64}$/u)
  assert.match(installation.inventorySha256, /^[a-f0-9]{64}$/u)
  assert.ok(
    Object.is(installation.files.length, 77),
  )
  const inventory = createHash('sha256').update(JSON.stringify(installation.files)).digest('hex')
  assert.ok(
    Object.is(inventory, installation.inventorySha256),
    'Public inventory changed without review',
  )
  verifyPublicReceipt(installation)
  verifyInstalledFiles(installation, dependencies)
}

function verifyPublicReceipt(installation: Installation): void {
  const proof = installation.verification
  assert.match(proof.ciUrl, /^https:\/\/github\.com\/zeithrold\/tools\/actions\/runs\/\d+$/u)
  assert.ok(
    Object.is(proof.artifactName, `public-ui-source-${installation.sourceSha}`),
  )
  assert.ok(
    Object.is(proof.receiptPath, 'docs/ui-public-installation.json'),
  )
  const bytes = readFileSync(proof.receiptPath)
  assert.ok(
    Object.is(createHash('sha256').update(bytes).digest('hex'), proof.receiptSha256),
    'Public CI receipt changed',
  )
  const receipt = publicReceiptSchema.parse(JSON.parse(bytes.toString()))
  assert.ok(
    Object.is(receipt.sourceSha, installation.sourceSha),
  )
  assert.ok(
    Object.is(receipt.payloadSha256, installation.registryItemSha256),
  )
  assert.ok(
    Object.is(receipt.publicInstallationVerified, true),
  )
  assert.ok(
    Object.is(receipt.fontVerification, 'google-fonts-api'),
  )
  assert.ok(
    Object.is(receipt.cssVerification, 'published-checker'),
  )
  assert.ok(
    Object.is(receipt.requiredUiPackage, false),
  )
  assert.ok(
    Object.is(receipt.cli, 'shadcn@4.21.1'),
  )
  const url = `https://raw.githubusercontent.com/zeithrold/tools/${installation.sourceSha}/registry/{name}.json`
  assert.ok(Object.is(receipt.registryUrl, url))
  assert.ok(
    isDeepStrictEqual(receipt.dependencies, installation.dependencies),
  )
  const upstream = installation.files.map(file => ({ installed: file.path, sha256: file.upstreamSha256 }))
  assert.ok(isDeepStrictEqual(receipt.files, upstream))
}

function verifyInstalledFiles(installation: Installation, dependencies: Record<string, string>): void {
  const expected = installation.files.map(file => file.path).sort()
  assert.ok(
    Object.is(new Set(expected).size, expected.length),
    'Duplicate public source paths',
  )
  for (const file of installation.files) {
    assert.match(file.path, /^components\/ui\/ztd-me\/(?!.*\.\.)[\w@./-]+$/u)
    assert.match(file.sha256, /^[a-f0-9]{64}$/u)
    assert.match(file.upstreamSha256, /^[a-f0-9]{64}$/u)
    if (file.sha256 !== file.upstreamSha256) {
      assert.ok(typeof file.adaptation === 'string' && file.adaptation.trim().length > 0)
    }
    const actual = createHash('sha256').update(readFileSync(file.path)).digest('hex')
    assert.ok(
      Object.is(actual, file.sha256),
      `Unreviewed public source change: ${file.path}`,
    )
  }
  assert.ok(
    isDeepStrictEqual(sourceFiles('components/ui/ztd-me').sort(), expected),
    'Public source must be installed atomically',
  )
  for (const dependency of installation.dependencies) {
    const separator = dependency.lastIndexOf('@')
    assert.ok(separator > 0, `Invalid public dependency pin: ${dependency}`)
    assert.ok(
      Object.is(dependencies[dependency.slice(0, separator)], dependency.slice(separator + 1)),
    )
  }
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(name) : [name]
  })
}
