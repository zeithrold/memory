import type { CloudflareOptions } from '@sentry/cloudflare'
import type { SentryEnvironment } from '../observability'
import type { Env } from './env'
import type { ProblemContext, ProblemDocument } from './errors'
import * as Sentry from '@sentry/cloudflare'
import { environmentFromOrigin, TRACES_SAMPLE_RATE } from '../observability'

/** Header names that must never reach Sentry, whatever the SDK defaults do. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
])
/**
 * genAI attributes that carry user content. Token usage and request parameters
 * are deliberately absent: they are the useful, content-free half of the span.
 * Names taken from `@sentry/core`'s gen-ai-attributes.
 */
const GEN_AI_CONTENT_ATTRIBUTES = new Set([
  'gen_ai.embeddings.input',
  'gen_ai.input.messages',
  'gen_ai.output.messages',
  'gen_ai.prompt',
  'gen_ai.request.available_tools',
  'gen_ai.response.text',
  'gen_ai.response.tool_calls',
  'gen_ai.system_instructions',
  'gen_ai.tool.input',
  'gen_ai.tool.output',
])
type ErrorEventArg = Parameters<NonNullable<CloudflareOptions['beforeSend']>>[0]
type TransactionEventArg = Parameters<
  NonNullable<CloudflareOptions['beforeSendTransaction']>
>[0]

function stripQuery(value: string): string {
  const index = value.indexOf('?')
  return index === -1 ? value : value.slice(0, index)
}
function scrubRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (GEN_AI_CONTENT_ATTRIBUTES.has(key))
      delete record[key]
  }
}
function scrubHeaders(headers: Record<string, string> | undefined): void {
  if (headers === undefined)
    return
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase()))
      delete headers[key]
  }
}
function scrubCommon(event: ErrorEventArg | TransactionEventArg): void {
  const request = event.request
  if (request !== undefined) {
    // Memory bodies and search queries travel in request data.
    delete request.data
    delete request.cookies
    delete request.query_string
    if (typeof request.url === 'string')
      request.url = stripQuery(request.url)
    scrubHeaders(request.headers)
  }
  if (event.user !== undefined) {
    delete event.user.email
    delete event.user.username
    delete event.user.ip_address
    delete event.user.name
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (typeof breadcrumb.message === 'string')
      breadcrumb.message = stripQuery(breadcrumb.message)
    if (breadcrumb.data !== undefined)
      scrubRecord(breadcrumb.data)
  }
}
/**
 * Defence in depth behind `sendDefaultPii: false`: even if SDK defaults widen,
 * raw memory content, search text and credentials are removed before sending.
 */
export function scrubEvent(event: ErrorEventArg): ErrorEventArg {
  scrubCommon(event)
  if (event.extra !== undefined)
    scrubRecord(event.extra)
  return event
}
export function scrubTransaction(
  event: TransactionEventArg,
): TransactionEventArg | null {
  // Documentation pages and OAuth discovery are noise, not user journeys.
  if (event.transaction !== undefined
    && (event.transaction.includes('/.well-known/')
      || event.transaction.includes('/errors'))) {
    return null
  }
  scrubCommon(event)
  for (const span of event.spans ?? []) {
    if (span.data !== undefined)
      scrubRecord(span.data)
  }
  return event
}
export function sentryEnvironment(
  env: Pick<Env, 'SENTRY_ENVIRONMENT' | 'APP_ORIGIN'>,
): SentryEnvironment {
  const explicit = env.SENTRY_ENVIRONMENT?.trim()
  if (explicit === 'stage' || explicit === 'production')
    return explicit
  return environmentFromOrigin(env.APP_ORIGIN)
}
export function traceRate(
  env: Pick<Env, 'SENTRY_TRACES_SAMPLE_RATE' | 'SENTRY_ENVIRONMENT' | 'APP_ORIGIN'>,
): number {
  const value = env.SENTRY_TRACES_SAMPLE_RATE?.trim()
  if (value !== undefined && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1)
      return parsed
  }
  return TRACES_SAMPLE_RATE[sentryEnvironment(env)]
}
export function sentryRelease(
  env: Pick<Env, 'SENTRY_RELEASE'>,
): string | undefined {
  const explicit = env.SENTRY_RELEASE?.trim()
  if (explicit !== undefined && explicit.length > 0)
    return explicit
  // Vite replaces the global expression with the build-time release.
  // eslint-disable-next-line node/prefer-global/process
  const built = process.env.SENTRY_RELEASE
  return built === undefined || built.length === 0 ? undefined : built
}
export function sentryOptions(env: Env): CloudflareOptions | undefined {
  const dsn = env.SENTRY_DSN?.trim()
  // No DSN is the normal state for local development and the e2e preview.
  if (dsn === undefined || dsn.length === 0)
    return undefined
  return {
    dsn,
    release: sentryRelease(env),
    environment: sentryEnvironment(env),
    tracesSampleRate: traceRate(env),
    // `dataCollection` is intentionally omitted: passing it would flip every
    // unspecified field back to Sentry's permissive defaults.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
  }
}
/**
 * Reports a failure the service could not handle. Client errors (4xx) are
 * expected traffic and never reach Sentry.
 */
export function captureRequestError(
  error: unknown,
  document: ProblemDocument,
  context: ProblemContext,
): void {
  if (document.status < 500)
    return
  Sentry.withScope((scope) => {
    scope.setTag('code', document.code)
    scope.setTag('status', String(document.status))
    if (context.method !== undefined)
      scope.setTag('method', context.method)
    Sentry.captureException(error)
  })
}
