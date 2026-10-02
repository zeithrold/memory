import type { LlmReply, Provider, RequestFailure } from './llm-types'
import { AppError } from './errors'

/**
 * One provider-neutral conversation interface over two backends.
 *
 * The catalog agent acts exclusively through tool calls, so tool calling is a
 * hard requirement rather than an optimisation: without it there is nothing to
 * audit. `responses-api` is the primary path because the Responses protocol
 * carries tool calls, completion status and usage without provider-specific
 * chat-completions fields; `workers-ai` remains an alternative for deployments
 * that already hold Workers AI quota.
 *
 * Two deliberate refusals:
 * - a redirect is never followed, so a bearer credential is never forwarded to
 *   another host (the same stance `examples/deepseek.py` takes);
 * - nothing is retried here. Retry policy belongs to the Workflow step, which
 *   can checkpoint around it.
 */
export const TIMEOUT_MS = 120_000

const DETAIL_LIMIT = 400

const LOOPBACK = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '::1',
])

/** Everything except the plaintext credential, which never leaves the request. */
export function describeProvider(
  provider: Provider,
): { provider: string, model: string | null } {
  switch (provider.kind) {
    case 'none':
      return { provider: 'none', model: null }
    case 'workers-ai':
      return { provider: 'workers-ai', model: provider.model }
    case 'responses-api':
      return { provider: 'responses-api', model: provider.model }
  }
}

/**
 * Normalises a user-supplied base URL. A path is allowed because providers
 * commonly version it (`https://openrouter.ai/api/v1`); a query string or
 * fragment is not, because the service appends its own route.
 */
export function normalizeBaseUrl(
  raw: string,
  allowLoopbackHttp: boolean,
): string {
  const value = raw.trim()
  if (value.length === 0) {
    throw new AppError('PROVIDER_ENDPOINT_INVALID', 'Enter a model endpoint URL.')
  }
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new AppError('PROVIDER_ENDPOINT_INVALID', 'The model endpoint is not a valid URL.')
  }
  const loopback = LOOPBACK.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && allowLoopbackHttp)) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint must use HTTPS. Plain HTTP is accepted only for a loopback host outside production.',
    )
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new AppError(
      'PROVIDER_ENDPOINT_INVALID',
      'The model endpoint must not carry a query string or fragment.',
    )
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

export function truncate(value: string): string {
  return value.length > DETAIL_LIMIT ? `${value.slice(0, DETAIL_LIMIT)}…` : value
}

export function requestFailure(
  error: unknown,
): RequestFailure {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return {
      code: 'PROVIDER_TIMEOUT',
      message: `The model endpoint did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`,
      retryable: true,
    }
  }
  const status = failureStatus(error)
  return {
    code: 'PROVIDER_ERROR',
    message: error instanceof Error
      ? `The model endpoint could not be reached: ${truncate(error.message)}`
      : 'The model endpoint could not be reached.',
    retryable: status === 429 || (status !== null && status >= 500),
  }
}

export async function readFailureBody(response: Response): Promise<string> {
  try {
    return truncate((await response.text()).replace(/\s+/g, ' ').trim())
  }
  catch {
    return ''
  }
}

export function isRedirect(
  response: Response,
): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)
}

/**
 * Converts a well-formed but unusable model response into a stable failure.
 * Callers persist paid usage before invoking this guard so a Workflow replay
 * can fail deterministically without paying for the same response again.
 */
export function assertActionableReply(reply: LlmReply): void {
  if (reply.status === 'incomplete') {
    throw new AppError(
      'PROVIDER_OUTPUT_INCOMPLETE',
      `The model response was incomplete (${reply.statusDetail ?? 'unknown reason'}).`,
      false,
    )
  }
  if (reply.status === 'failed') {
    throw new AppError(
      'PROVIDER_ERROR',
      `The model reported a failed response (${reply.statusDetail ?? 'unknown reason'}).`,
      false,
    )
  }
  if (reply.toolCalls.length === 0) {
    throw new AppError(
      'PROVIDER_TOOL_UNSUPPORTED',
      'The model completed the request without calling a required tool.',
      false,
    )
  }
}

function failureStatus(error: unknown): number | null {
  const status = typeof error === 'object' && error !== null && 'status' in error
    && typeof error.status === 'number'
    ? error.status
    : null
  return status
}
