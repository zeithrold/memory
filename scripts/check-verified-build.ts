import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { verifyBuildBoundary } from './verified-build-boundary'
import { verifyUiSource } from './verify-ui-source'

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (revision !== process.env.GITHUB_SHA) {
  throw new Error('Deployment checkout differs from the workflow commit')
}
verifyBuildBoundary(
  JSON.parse(readFileSync('.zt/verified-build/.zt/artifacts/metadata.json', 'utf8')),
  {
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    revision,
    lockfileSha256: createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex'),
  },
)
verifyUiSource()
process.stdout.write('Verified source and lockfile; production will be rebuilt independently of preview artifacts.\n')
