import { providerErrors } from './errors-provider'
import { requestErrors } from './errors-request'
import { storageErrors } from './errors-storage'
/**
 * The single source of truth for every machine error this service can return.
 *
 * RFC 9457 makes `type` a URI that identifies the problem kind, `title` a stable
 * human-readable summary, and `status` the HTTP status code. Keeping all three in
 * one table means a documented error page and the response that points at it can
 * never disagree, and `ErrorCode` makes an undocumented code a compile error.
 */
export type ErrorDefinition = {
  /** Path segment under `/errors`, stable and safe to bookmark. */
  readonly slug: string
  readonly status: number
  /** RFC 9457 `title`: short, stable, and not occurrence-specific. */
  readonly title: string
  /** What the condition means and when the service returns it. */
  readonly summary: string
  /** What a client or an agent should do next. */
  readonly remediation: readonly string[]
  /** Whether retrying the identical request can succeed without changes. */
  readonly retryable: boolean
}

export const ERROR_DEFINITIONS = { ...requestErrors, ...storageErrors, ...providerErrors } as const

export type ErrorCode = keyof typeof ERROR_DEFINITIONS

export type CatalogEntry = ErrorDefinition & {
  readonly code: ErrorCode
}
export const ERROR_CODES = Object.keys(ERROR_DEFINITIONS).filter(
  (code): code is ErrorCode => Object.hasOwn(ERROR_DEFINITIONS, code),
)
export const ERROR_ENTRIES: readonly CatalogEntry[] = ERROR_CODES.map(code => ({
  code,
  ...ERROR_DEFINITIONS[code],
}))
export const ERROR_BY_SLUG: ReadonlyMap<string, CatalogEntry> = new Map(
  ERROR_ENTRIES.map(entry => [entry.slug, entry]),
)
export const ERROR_BY_STATUS: readonly CatalogEntry[] = [
  ...ERROR_ENTRIES,
].sort(
  (
    left,
    right,
  ) =>
    left.status === right.status ? left.code.localeCompare(right.code) : left.status - right.status,
)
export function errorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code]
}
/** `/errors/<slug>` on the origin that produced the response. */
export function problemType(origin: string, code: ErrorCode): string {
  return `${origin.replace(/\/+$/, '')}/errors/${ERROR_DEFINITIONS[code].slug}`
}
