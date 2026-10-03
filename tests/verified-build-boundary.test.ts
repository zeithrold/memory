import { expect, it } from 'vitest'
import { verifyBuildBoundary } from '../scripts/verified-build-boundary'

const revision = 'a'.repeat(40)
const lockfileSha256 = 'b'.repeat(64)
const context = { eventName: 'push', ref: 'refs/heads/main', revision, lockfileSha256 }
const metadata = { buildPurpose: 'unsigned-verification', revision, lockfileSha256, dirty: false }

it('accepts same-commit verification provenance only on a main push', () => {
  expect(() => verifyBuildBoundary(metadata, context)).not.toThrow()
})

it('rejects branch pushes and pull requests regardless of artifact validity', () => {
  expect(() => verifyBuildBoundary(metadata, { ...context, ref: 'refs/heads/topic' })).toThrow('main push')
  expect(() => verifyBuildBoundary(metadata, { ...context, eventName: 'pull_request' })).toThrow('main push')
})

it('rejects a build from another commit', () => {
  expect(() => verifyBuildBoundary({ ...metadata, revision: 'c'.repeat(40) }, context))
    .toThrow('revision differs')
})

it('rejects a lockfile mismatch', () => {
  expect(() => verifyBuildBoundary({ ...metadata, lockfileSha256: 'c'.repeat(64) }, context))
    .toThrow('lockfile differs')
})

it('rejects dirty verification source', () => {
  expect(() => verifyBuildBoundary({ ...metadata, dirty: true }, context)).toThrow()
})

it('rejects artifacts presented as production or lacking the preview boundary marker', () => {
  expect(() => verifyBuildBoundary({ ...metadata, buildPurpose: 'production' }, context)).toThrow()
  expect(() => verifyBuildBoundary({ revision, lockfileSha256, dirty: false }, context)).toThrow()
})
