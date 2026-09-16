import { AppError } from './errors'

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError(415, 'JSON_REQUIRED', 'Use application/json.')
  const reader = request.body?.getReader()
  if (!reader)
    throw new AppError(400, 'INVALID_JSON', 'A JSON body is required.')
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
        throw new AppError(
          413,
          'BODY_TOO_LARGE',
          'Request body exceeds 64 KiB.',
        )
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    try {
      return JSON.parse(text) as unknown
    }
    catch {
      throw new AppError(
        400,
        'INVALID_JSON',
        'The request body is not valid JSON.',
      )
    }
  }
  finally {
    reader.releaseLock()
  }
}
export function secureResponse(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  if (response.status === 429)
    response.headers.set('Retry-After', '60')
  if (response.status === 401)
    response.headers.set('WWW-Authenticate', 'Bearer realm="Shared Memory"')
  return response
}
