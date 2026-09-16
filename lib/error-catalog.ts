/**
 * The single source of truth for every machine error this service can return.
 *
 * RFC 9457 makes `type` a URI that identifies the problem kind, `title` a stable
 * human-readable summary, and `status` the HTTP status code. Keeping all three in
 * one table means a documented error page and the response that points at it can
 * never disagree, and `ErrorCode` makes an undocumented code a compile error.
 */
export interface ErrorDefinition {
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

export const ERROR_DEFINITIONS = {
  UNAUTHORIZED: {
    slug: 'unauthorized',
    status: 401,
    title: 'Unauthorized',
    summary:
      'The request did not carry a usable credential: no bearer token, a personal token that is invalid, expired, or revoked, or a browser session that has expired.',
    remediation: [
      'Send the credential as `Authorization: Bearer <credential>`.',
      'Create a personal `mem_…` token for an agent, or sign in again in the browser.',
      'Reusing a revoked token cannot succeed; issue a new one.',
    ],
    retryable: false,
  },
  FORBIDDEN: {
    slug: 'forbidden',
    status: 403,
    title: 'Forbidden',
    summary:
      'The credential is valid but is not allowed to perform this operation: the token lacks the scope, it is restricted to another project, the endpoint requires a browser session, or the origin is not allowed.',
    remediation: [
      'Check the token scopes (`memory:read`, `memory:write`, `memory:delete`).',
      'A project-restricted token cannot read or write other projects, including `global`.',
      'Token management and account usage are session-only operations.',
    ],
    retryable: false,
  },
  INSUFFICIENT_SCOPE: {
    slug: 'insufficient-scope',
    status: 403,
    title: 'Insufficient scope',
    summary:
      'An OAuth connection was verified, but the access token grants none of the memory scopes. This usually means the authorization server applied default scopes that do not include them, or the user declined them on the consent screen.',
    remediation: [
      'Grant `memory:read` and `memory:write` (and `memory:delete` if forgetting is required) to the client in the authorization server.',
      'Include the memory scopes in the default scopes, because an MCP host may omit the `scope` parameter.',
      'Re-link the account after changing the granted scopes.',
    ],
    retryable: false,
  },
  SESSION_REQUIRED: {
    slug: 'session-required',
    status: 403,
    title: 'Session required',
    summary:
      'The endpoint manages tokens or reports account usage, and only accepts a signed-in browser session rather than a personal token or an OAuth connection.',
    remediation: [
      'Use the web interface for token management and usage.',
      'An agent credential can never mint or revoke other credentials.',
    ],
    retryable: false,
  },
  INVALID_ORIGIN: {
    slug: 'invalid-origin',
    status: 403,
    title: 'Invalid origin',
    summary:
      'A browser-session request carried an `Origin` header that does not match the configured application origin. This guards session credentials, which the browser attaches implicitly.',
    remediation: [
      'Call the API from the configured application origin.',
      'Machine clients may omit `Origin` entirely, which is the expected case for agents.',
    ],
    retryable: false,
  },
  INVALID_INPUT: {
    slug: 'invalid-input',
    status: 400,
    title: 'Invalid input',
    summary:
      'One or more fields failed schema validation. Unknown fields are rejected rather than ignored, so a typo in a mutation body is reported instead of silently dropped.',
    remediation: [
      'Read the `fields` member of this problem document; each entry names the path and the rule it broke.',
      'Send only the documented fields for the operation.',
    ],
    retryable: false,
  },
  INVALID_JSON: {
    slug: 'invalid-json',
    status: 400,
    title: 'Malformed JSON',
    summary:
      'The request body was missing, empty, or not parseable as JSON.',
    remediation: [
      'Send a JSON body with `Content-Type: application/json`.',
      'Mutations that accept no fields still require an empty JSON object.',
    ],
    retryable: false,
  },
  IMMUTABLE_PROJECT: {
    slug: 'immutable-project',
    status: 400,
    title: 'Immutable project',
    summary:
      'An update tried to move an existing memory to a different project. A memory\'s project is part of its identity, its deduplication fingerprint, and its vector filter.',
    remediation: [
      'Keep `project` unchanged in an update.',
      'Create a new memory in the target project and forget the old one if a move is really intended.',
    ],
    retryable: false,
  },
  NOT_FOUND: {
    slug: 'not-found',
    status: 404,
    title: 'Not found',
    summary:
      'The memory, token, or endpoint does not exist, has been forgotten, or belongs to another account. Identifiers from other accounts are never disclosed, so a foreign identifier is reported exactly like a missing one.',
    remediation: [
      'List or search memories to discover identifiers you own.',
      'A forgotten memory keeps its identifier as a tombstone but is no longer readable.',
    ],
    retryable: false,
  },
  METHOD_NOT_ALLOWED: {
    slug: 'method-not-allowed',
    status: 405,
    title: 'Method not allowed',
    summary:
      'The path exists but does not accept this HTTP method. The MCP endpoint accepts `POST` only, and the OAuth discovery documents accept `GET` and `OPTIONS`.',
    remediation: [
      'Read the `Allow` response header for the accepted methods.',
      'MCP clients must POST JSON-RPC to `/mcp`; there is no protocol session to read or delete.',
    ],
    retryable: false,
  },
  CONFLICT: {
    slug: 'conflict',
    status: 409,
    title: 'Conflict',
    summary:
      'The write is ambiguous: an idempotency key, or an exact title and content fingerprint, already exists in this project with different fields or after a forget. The service refuses to guess which version the caller meant.',
    remediation: [
      'Read the existing memory and reconcile the fields.',
      'Reuse an idempotency key only with its original payload.',
      'Do not attempt to recreate forgotten content; ask the user first.',
    ],
    retryable: false,
  },
  VERSION_CONFLICT: {
    slug: 'version-conflict',
    status: 409,
    title: 'Version conflict',
    summary:
      '`expectedVersion` does not match the current version of the memory, so another client changed it after this one read it. Updates and deletes are compare-and-swap to protect concurrent agents from overwriting each other.',
    remediation: [
      'Read the memory again and reconcile the content with the new evidence.',
      'Retry with the current version instead of blindly repeating the request.',
    ],
    retryable: false,
  },
  FORGOTTEN: {
    slug: 'forgotten',
    status: 409,
    title: 'Forgotten memory',
    summary:
      'An identical memory was explicitly forgotten. The identifier, timestamps, and content fingerprint remain as a tombstone, and the exact text is intentionally blocked from being recreated.',
    remediation: [
      'Ask the user before storing this content again.',
      'Do not paraphrase the title or change the text to bypass the tombstone.',
      'Exact matching is a backstop, not semantic forgetting: unrelated paraphrases are still allowed.',
    ],
    retryable: false,
  },
  BODY_TOO_LARGE: {
    slug: 'body-too-large',
    status: 413,
    title: 'Request body too large',
    summary:
      'The request body exceeded 64 KiB. Memories are meant to be concise entries, not transcripts or documents.',
    remediation: [
      'Store one short topic per memory and split anything larger.',
      'Remove attachments or pasted transcripts before sending.',
    ],
    retryable: false,
  },
  JSON_REQUIRED: {
    slug: 'json-required',
    status: 415,
    title: 'JSON content type required',
    summary:
      'The request did not declare `Content-Type: application/json`, so the body was not read.',
    remediation: [
      'Set the `Content-Type` header to `application/json`.',
      'Do not send form-encoded bodies to this API.',
    ],
    retryable: false,
  },
  RATE_LIMITED: {
    slug: 'rate-limited',
    status: 429,
    title: 'Rate limited',
    summary:
      'The account exceeded 120 authenticated requests in one minute, counted across all of its tokens and OAuth connections. The limit protects the service; it is not a billing quota.',
    remediation: [
      'Wait for the number of seconds in the `Retry-After` header before retrying.',
      'Batch reads and avoid re-searching for the same context inside one task.',
    ],
    retryable: true,
  },
  INTERNAL_ERROR: {
    slug: 'internal-error',
    status: 500,
    title: 'Internal error',
    summary:
      'The request failed unexpectedly. The response deliberately omits internal detail, and a failed mutation may or may not have been applied.',
    remediation: [
      'Read the resource again before retrying a mutation.',
      'When retrying a creation, reuse the original idempotency key so a duplicate is not stored.',
      'Report the problem with the request path and time if it persists.',
    ],
    retryable: true,
  },
  AUTH_NOT_CONFIGURED: {
    slug: 'authorization-not-configured',
    status: 503,
    title: 'Authorization not configured',
    summary:
      'This deployment has no Clerk secret key, so no credential can be verified and no OAuth discovery document can be published. Private endpoints fail closed rather than serving unauthenticated data.',
    remediation: [
      'Set the `CLERK_SECRET_KEY` secret for the Worker and redeploy.',
      'Public previews without credentials are expected to return this on every private endpoint.',
    ],
    retryable: false,
  },
  INDEX_UNAVAILABLE: {
    slug: 'index-unavailable',
    status: 503,
    title: 'Index unavailable',
    summary:
      'Semantic indexing needs the Workers AI binding, which is not configured on this deployment. Keyword search keeps working, and pending index jobs are retried later rather than dropped.',
    remediation: [
      'Add the `AI` and `VECTORIZE` bindings and redeploy to enable hybrid retrieval.',
      'Search responses report `degraded: true` while running on keywords alone.',
    ],
    retryable: false,
  },
} as const satisfies Record<string, ErrorDefinition>

export type ErrorCode = keyof typeof ERROR_DEFINITIONS

export interface CatalogEntry extends ErrorDefinition {
  readonly code: ErrorCode
}
export const ERROR_CODES = Object.keys(ERROR_DEFINITIONS) as ErrorCode[]
export const ERROR_ENTRIES: readonly CatalogEntry[] = ERROR_CODES.map(code => ({
  code,
  ...ERROR_DEFINITIONS[code],
}))
export const ERROR_BY_SLUG: ReadonlyMap<string, CatalogEntry> = new Map(
  ERROR_ENTRIES.map(entry => [entry.slug, entry]),
)
export const ERROR_BY_STATUS: readonly CatalogEntry[] = [...ERROR_ENTRIES].sort(
  (left, right) =>
    left.status - right.status || left.code.localeCompare(right.code),
)
export function errorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code]
}
/** `/errors/<slug>` on the origin that produced the response. */
export function problemType(origin: string, code: ErrorCode): string {
  return `${origin.replace(/\/+$/, '')}/errors/${ERROR_DEFINITIONS[code].slug}`
}
