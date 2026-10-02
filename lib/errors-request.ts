import type { ErrorDefinition } from './error-catalog'

export const requestErrors = {
  UNAUTHORIZED: {
    slug: 'unauthorized',
    status: 401,
    title: 'Unauthorized',
    summary:
      ('The request did not carry a usable credential: no bearer token, a personal '
        + 'token that is invalid, expired, or revoked, or a browser session that has '
        + 'expired.'),
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
      ('The credential is valid but is not allowed to perform this operation: the '
        + 'token lacks the scope, it is restricted to another project, the endpoint '
        + 'requires a browser session, or the origin is not allowed.'),
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
      ('An OAuth connection was verified, but the access token grants none of the '
        + 'memory scopes. This usually means the authorization server applied default '
        + 'scopes that do not include them, or the user declined them on the consent '
        + 'screen.'),
    remediation: [
      (
        'Grant `memory:read` and `memory:write` (and `memory:delete` if forgetting '
        + 'is required) to the client in the authorization server.'),
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
      ('The endpoint manages tokens or reports account usage, and only accepts a '
        + 'signed-in browser session rather than a personal token or an OAuth connection.'),
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
      ('A browser-session request carried an `Origin` header that does not match '
        + 'the configured application origin. This guards session credentials, which '
        + 'the browser attaches implicitly.'),
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
      ('One or more fields failed schema validation. Unknown fields are rejected '
        + 'rather than ignored, so a typo in a mutation body is reported instead of '
        + 'silently dropped.'),
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
      ('An update tried to move an existing memory to a different project. A '
        + 'memory\'s project is part of its identity, its deduplication fingerprint, '
        + 'and its vector filter.'),
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
      ('The memory, token, or endpoint does not exist, has been forgotten, or '
        + 'belongs to another account. Identifiers from other accounts are never '
        + 'disclosed, so a foreign identifier is reported exactly like a missing one.'),
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
      ('The path exists but does not accept this HTTP method. The MCP endpoint '
        + 'accepts `POST` only, and the OAuth discovery documents accept `GET` and '
        + '`OPTIONS`.'),
    remediation: [
      'Read the `Allow` response header for the accepted methods.',
      'MCP clients must POST JSON-RPC to `/mcp`; there is no protocol session to read or delete.',
    ],
    retryable: false,
  },
} as const satisfies Record<string, ErrorDefinition>
