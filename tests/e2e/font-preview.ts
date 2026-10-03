import type { BrowserContext } from '@playwright/test'
import { createHash } from 'node:crypto'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { test as base } from '@playwright/test'

export const localFontPreview = process.env.MEMORY_LOCAL_FONT_PREVIEW !== undefined
if (localFontPreview && process.env.CI !== undefined) {
  throw new Error('CI requires actual Google Fonts; local preview is Cloud-only')
}

// Explicit isolated Cloud preview after a demonstrated Chromium certificate failure.
// Only test responses change. Downloaded bytes stay outside the checkout, using
// ordinary verified Node TLS; the built/production stylesheet is never modified.
export async function configureFontPreview(context: BrowserContext): Promise<void> {
  const directory = process.env.MEMORY_LOCAL_FONT_PREVIEW
  if (directory === undefined) {
    return
  }
  const source = await readFile('components/ui/ztd-me/styles/fonts.css', 'utf8')
  const apiUrl = source.match(/@import url\("([^"]+)"\)/u)?.[1]
  if (apiUrl === undefined) {
    throw new Error('No delivered Google Fonts query')
  }
  const files = new Map<string, string>()
  const css = (await readFile(path.join(directory, 'fonts.css'), 'utf8'))
    .replace(/url\((https:[^)]+)\)/gu, (_match: string, url: string) => {
      if (new URL(url).origin !== 'https://fonts.gstatic.com') {
        throw new Error('Unexpected font origin')
      }
      const name = `${createHash('sha256').update(url).digest('hex')}.woff2`
      files.set(name, url)
      return `url(/__local-noto-preview/${name})`
    })
  await context.route('**/_next/static/css/*.css', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replaceAll(apiUrl, '/__local-noto-preview/fonts.css')
    await route.fulfill({ response, body })
  })
  await context.route('**/__local-noto-preview/*', async (route) => {
    const filename = path.basename(new URL(route.request().url()).pathname)
    if (filename === 'fonts.css') {
      await route.fulfill({ contentType: 'text/css', body: css })
      return
    }
    const url = files.get(filename)
    if (url === undefined) {
      throw new Error('Unknown local preview font')
    }
    const file = path.join(directory, filename)
    try {
      await access(file)
    }
    catch {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) {
        throw new Error(`Font preview download failed: ${response.status}`)
      }
      await writeFile(file, new Uint8Array(await response.arrayBuffer()))
    }
    await route.fulfill({ contentType: 'font/woff2', path: file })
  })
}

export const test = base.extend({
  context: async ({ context }, runTest) => {
    await configureFontPreview(context)
    await runTest(context)
  },
})
