import type { ErrorDefinition } from './error-catalog'

export const storageErrors = {
  CONFLICT: {
    slug: 'conflict',
    status: 409,
    title: 'Conflict',
    summary:
      ('The write is ambiguous: an idempotency key, or an exact title and content '
        + 'fingerprint, already exists in this project with different fields or after '
        + 'a forget. The service refuses to guess which version the caller meant.'),
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
      ('`expectedVersion` does not match the current version of the memory, so '
        + 'another client changed it after this one read it. Updates and deletes are '
        + 'compare-and-swap to protect concurrent agents from overwriting each other.'),
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
      ('An identical memory was explicitly forgotten. The identifier, timestamps, '
        + 'and content fingerprint remain as a tombstone, and the exact text is '
        + 'intentionally blocked from being recreated.'),
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
      ('The account exceeded 120 authenticated requests in one minute, counted '
        + 'across all of its tokens and OAuth connections. The limit protects the '
        + 'service; it is not a billing quota.'),
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
      ('The request failed unexpectedly. The response deliberately omits internal '
        + 'detail, and a failed mutation may or may not have been applied.'),
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
      ('This deployment has no Cloudflare Access team domain or application '
        + 'audience, so no credential can be verified and no OAuth discovery document '
        + 'can be published. Private endpoints fail closed rather than serving '
        + 'unauthenticated data.'),
    remediation: [
      'Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` for the Worker and redeploy.',
      (
        'Public previews without credentials are expected to return this on '
        + 'discovery and when an Access token is presented without configuration.'),
    ],
    retryable: false,
  },

  INDEX_UNAVAILABLE: {
    slug: 'index-unavailable',
    status: 503,
    title: 'Index unavailable',
    summary:
      ('Semantic indexing needs the Workers AI binding, which is not configured on '
        + 'this deployment. Keyword search keeps working, and pending index jobs are '
        + 'retried later rather than dropped.'),
    remediation: [
      'Add the `AI` and `VECTORIZE` bindings and redeploy to enable hybrid retrieval.',
      'Search responses report `degraded: true` while running on keywords alone.',
    ],
    retryable: false,
  },

  AGENT_NOT_CONFIGURED: {
    slug: 'agent-not-configured',
    status: 409,
    title: 'Catalog agent not configured',
    summary:
      ('The catalog maintenance job has no model endpoint to call. This service is '
        + 'platform neutral and never pays for inference, so a catalog run starts only '
        + 'once the account supplies its own Responses API endpoint and API key.'),
    remediation: [
      'Open the Catalog tab and enter an endpoint, a model, and an API key for the account.',
      (
        'Run the connection test before saving, so an endpoint without tool support '
        + 'fails at configuration time instead of mid-run.'),
      'A scheduled run against an unconfigured account finishes immediately with status `skipped` and changes nothing.',
    ],
    retryable: false,
  },
} as const satisfies Record<string, ErrorDefinition>
