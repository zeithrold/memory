import { AppError } from './errors'

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('JSON_REQUIRED', 'Use application/json.')
  const reader = request.body?.getReader()
  if (!reader)
    throw new AppError('INVALID_JSON', 'A JSON body is required.')
  let bytes = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      bytes += chunk.value.byteLength
      if (bytes > 65536) {
        await reader.cancel()
        throw new AppError('BODY_TOO_LARGE', 'Request body exceeds 64 KiB.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    try {
      return JSON.parse(text) as unknown
    }
    catch {
      throw new AppError('INVALID_JSON', 'The request body is not valid JSON.')
    }
  }
  finally {
    reader.releaseLock()
  }
}
export function secureResponse(response: Response, challenge?: string): Response {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  if (response.status === 429)
    response.headers.set('Retry-After', '60')
  if (challenge !== undefined && (response.status === 401 || response.status === 403)) {
    response.headers.set('WWW-Authenticate', challenge)
  }
  else if (response.status === 401 && !response.headers.has('WWW-Authenticate')) {
    response.headers.set('WWW-Authenticate', 'Bearer realm="Shared Memory"')
  }
  return response
}
/**
 * Public OAuth discovery documents. These are safe to cache and must be
 * reachable without a credential, including from browser-based clients.
 */
export function metadataResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
