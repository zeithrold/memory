import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { verifyUiSource } from './verify-ui-source'

const root = '.zt/artifacts/font-ci'
mkdirSync(root, { recursive: true })
const metadata = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  ciHead: process.env.MEMORY_SOURCE_REVISION ?? null,
  node: process.version,
  uiSource: verifyUiSource(),
  requiredFontDelivery: 'google-fonts-api',
  localFontPreviewEnabled: process.env.MEMORY_LOCAL_FONT_PREVIEW !== undefined,
}
writeFileSync(`${root}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
  consumerHead: metadata.ciHead ?? metadata.revision,
  uiSource: metadata.uiSource.sourceSha,
  filesVerified: metadata.uiSource.files.length,
  requiredFontDelivery: metadata.requiredFontDelivery,
})}\n`)
