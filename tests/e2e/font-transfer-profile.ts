import type { Page } from '@playwright/test'
import { z } from 'zod'

interface Face { family: string, weight: string | undefined }
export interface FontResource {
  url: string
  kind: 'font' | 'font-css'
  status: number
  cached: boolean
  httpResponseBytes: number
  httpDecodedBodyBytes?: number | undefined
  decodedBodySource?: string
  faces?: Face[]
}
export function summarizeResources(resources: FontResource[]): {
  family: string
  requests: number
  cachedRequests: number
  httpResponseBytes: number
  httpDecodedBodyBytes: number
}[] {
  const rows = new Map<string, {
    family: string
    requests: number
    cachedRequests: number
    httpResponseBytes: number
    httpDecodedBodyBytes: number
  }>()
  for (const resource of resources) {
    const names = Array.from(new Set(resource.faces?.map(face => face.family))).join(', ')
    const family = names.length === 0 ? resource.kind : names
    const row = rows.get(family)
      ?? { family, requests: 0, cachedRequests: 0, httpResponseBytes: 0, httpDecodedBodyBytes: 0 }
    row.requests++
    row.cachedRequests += Number(resource.cached)
    row.httpResponseBytes += resource.httpResponseBytes
    row.httpDecodedBodyBytes += resource.httpDecodedBodyBytes ?? 0
    rows.set(family, row)
  }
  return Array.from(rows.values())
}
interface Sample {
  phase: string
  responses: Map<string, FontResource>
  cached: Set<string>
  bodies: Promise<void>[]
}
const responseSchema = z.object({
  requestId: z.string(),
  type: z.string(),
  response: z.object({
    url: z.url(),
    status: z.number(),
    fromDiskCache: z.boolean().optional(),
    fromServiceWorker: z.boolean().optional(),
  }),
})
const finishedSchema = z.object({ requestId: z.string(), encodedDataLength: z.number() })
const cachedSchema = z.object({ requestId: z.string() })

function isFontCss(url: string): boolean {
  return new URL(url).origin === 'https://fonts.googleapis.com'
    || url.includes('/__local-noto-preview/fonts.css')
}
function readFace(body: string): { family: string, source: string, weight: string | undefined } | undefined {
  const family = body.match(/font-family:\s*['"]([^'"]+)['"]/u)?.[1]
  const source = body.match(/url\(([^)]+)\)/u)?.[1]?.replace(/^['"]|['"]$/gu, '')
  if (family === undefined || source === undefined) {
    return undefined
  }
  return { family, source, weight: body.match(/font-weight:\s*([^;]+)/u)?.[1] }
}
function readFamilies(css: string, url: string, families: Map<string, Face[]>): void {
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]+)\}/gu)) {
    const face = body === undefined ? undefined : readFace(body)
    if (face === undefined) {
      continue
    }
    const href = new URL(face.source, url).href
    const records = families.get(href) ?? []
    if (!records.some(record => record.family === face.family && record.weight === face.weight)) {
      records.push({ family: face.family, weight: face.weight })
    }
    families.set(href, records)
  }
}

// CDP encodedDataLength counts encoded HTTP response bytes (headers + payload),
// including Google API CSS. Decoded bodies are reported separately, never added.
export async function transferProfile(page: Page): Promise<
  (phase: string, navigate: () => Promise<unknown>) => Promise<FontResource[]>
> {
  const session = await page.context().newCDPSession(page)
  await session.send('Network.enable')
  let active: Sample | undefined
  const families = new Map<string, Face[]>()
  const decoded = new Map<string, number>()
  session.on('Network.requestServedFromCache', (event: unknown) => {
    active?.cached.add(cachedSchema.parse(event).requestId)
  })
  session.on('Network.responseReceived', (event: unknown) => {
    const { requestId, type, response } = responseSchema.parse(event)
    if (active === undefined || (type !== 'Font' && !isFontCss(response.url))) {
      return
    }
    active.responses.set(requestId, {
      url: response.url,
      kind: type === 'Font' ? 'font' : 'font-css',
      status: response.status,
      cached: response.fromDiskCache === true || response.fromServiceWorker === true,
      httpResponseBytes: 0,
    })
  })
  session.on('Network.loadingFinished', (event: unknown) => {
    const { requestId, encodedDataLength } = finishedSchema.parse(event)
    const response = active?.responses.get(requestId)
    if (response !== undefined) {
      response.httpResponseBytes = encodedDataLength
    }
  })
  recordDecodedBodies(page, () => active, decoded, families)
  return async (phase, navigate) => {
    const current: Sample = { phase, responses: new Map(), cached: new Set(), bodies: [] }
    active = current
    await navigate()
    await page.evaluate(async () => await document.fonts.ready)
    await Promise.all(current.bodies)
    return Array.from(current.responses, ([id, response]) => ({
      ...response,
      cached: response.cached || current.cached.has(id),
      httpDecodedBodyBytes: decoded.get(response.url),
      decodedBodySource: phase === 'cold' ? 'current-response' : 'previous-cold-response-body',
      faces: families.get(response.url) ?? [],
    }))
  }
}

function recordDecodedBodies(
  page: Page,
  sample: () => Sample | undefined,
  decoded: Map<string, number>,
  families: Map<string, Face[]>,
): void {
  page.on('response', (response) => {
    const active = sample()
    if (active === undefined || active.phase !== 'cold'
      || (response.request().resourceType() !== 'font' && !isFontCss(response.url()))) {
      return
    }
    active.bodies.push(response.body().then((bytes) => {
      decoded.set(response.url(), bytes.length)
      if (isFontCss(response.url())) {
        readFamilies(bytes.toString(), response.url(), families)
      }
    }))
  })
}
