import type { ErrorDefinition } from './error-catalog'

export const providerErrors = {
  AGENT_KEY_UNCONFIGURED: {
    slug: 'agent-key-unconfigured',
    status: 503,
    title: 'Credential storage unavailable',
    summary:
      ('The deployment has no usable `AGENT_SETTINGS_KEY`, so a per-account model '
        + 'credential cannot be encrypted. The service fails closed rather than '
        + 'storing a key in plaintext.'),
    remediation: [
      (
        'Set the secret with `wrangler secret put AGENT_SETTINGS_KEY`, using 64 hex '
        + 'characters (32 bytes), for example from `openssl rand -hex 32`.'),
      (
        'Redeploy after setting it. Changing the key makes already stored '
        + 'credentials unreadable, and they must be entered again.'),
    ],
    retryable: false,
  },

  CATALOG_DISABLED: {
    slug: 'catalog-disabled',
    status: 409,
    title: 'Catalog unavailable',
    summary:
      ('This deployment declares no catalog Workflow, so maintenance runs cannot be '
        + 'scheduled or triggered here. The end-to-end test build omits the binding on '
        + 'purpose.'),
    remediation: [
      'Deploy the `workflows` entry from `wrangler.jsonc` to enable scheduled catalog maintenance.',
      'The read-only catalog stays available, but remains empty until the first run completes.',
    ],
    retryable: false,
  },

  RUN_NOT_FOUND: {
    slug: 'run-not-found',
    status: 404,
    title: 'Run not found',
    summary:
      ('No catalog run exists with that identifier for this account. Identifiers '
        + 'belonging to another account are never disclosed.'),
    remediation: ['List recent runs with `GET /api/v1/catalog/runs` and use an identifier from that response.'],
    retryable: false,
  },

  RUN_IN_PROGRESS: {
    slug: 'run-in-progress',
    status: 409,
    title: 'Run already in progress',
    summary:
      ('A catalog run for this account is already queued or running. Runs are '
        + 'serialized per account so two agents cannot reorganize the same catalog at '
        + 'the same time.'),
    remediation: [
      'Wait for the current run to reach a terminal status; the catalog page shows its progress.',
      'Repeat the request once it has finished.',
    ],
    retryable: true,
  },

  PROVIDER_ENDPOINT_INVALID: {
    slug: 'provider-endpoint-invalid',
    status: 400,
    title: 'Model endpoint invalid',
    summary:
      ('The configured model endpoint is not a usable URL. It must be an absolute '
        + 'HTTPS URL, and it must not redirect: a redirect is refused so a bearer '
        + 'credential is never forwarded to another host.'),
    remediation: [
      'Enter the base URL of a Responses API endpoint, for example `https://api.openai.com/v1`.',
      (
        'Keep the version path the provider documents, but omit the resource path, '
        + 'query string, and fragment; the service appends `/responses` itself.'),
      'Plain HTTP is accepted only for a loopback host while `APP_ORIGIN` is itself a local origin.',
    ],
    retryable: false,
  },

  PROVIDER_TOOL_UNSUPPORTED: {
    slug: 'provider-tool-unsupported',
    status: 502,
    title: 'Model does not support tools',
    summary:
      ('The configured model returned a completed response without the required '
        + 'function call, or did not accept the function definitions. The catalog '
        + 'agent acts exclusively through tools, so falling back to prose would '
        + 'produce changes nothing could audit.'),
    remediation: [
      'Choose a model that supports function calling, then run the connection test again.',
      'Some self-hosted deployments expose models without tool support; point the endpoint at a tool-capable one.',
    ],
    retryable: false,
  },

  PROVIDER_OUTPUT_INCOMPLETE: {
    slug: 'provider-output-incomplete',
    status: 502,
    title: 'Model output incomplete',
    summary:
      ('The model endpoint returned a valid Responses API envelope but did not '
        + 'complete it, for example because it reached the output-token limit or a '
        + 'content filter stopped generation. The paid turn is recorded and the '
        + 'catalog run stops before applying or implicitly skipping the batch.'),
    remediation: [
      'Read the failing run to see the recorded incomplete reason.',
      (
        'Reduce the batch size or choose a model that can complete the required '
        + 'function call within 4,096 output tokens.'),
      'Run the connection test before starting another catalog run.',
    ],
    retryable: false,
  },

  PROVIDER_ERROR: {
    slug: 'provider-error',
    status: 502,
    title: 'Model request failed',
    summary:
      ('The configured model endpoint returned an error or an unreadable response '
        + 'during a catalog run. The run stops, leaving the catalog exactly as the '
        + 'last completed batch left it.'),
    remediation: [
      'Read the failing run in the Catalog tab; the recorded error code names the cause.',
      'Check the endpoint, the model name, and the credential, then run the connection test again.',
      (
        'Only timeout, HTTP 408, 429, and 5xx failures are retried automatically; '
        + 'correct deterministic protocol or configuration failures before starting '
        + 'another run.'),
    ],
    retryable: true,
  },

  PROVIDER_TIMEOUT: {
    slug: 'provider-timeout',
    status: 504,
    title: 'Model request timed out',
    summary:
      ('The configured model endpoint did not answer within the time allowed for '
        + 'one conversation turn of a catalog run.'),
    remediation: [
      'Run the catalog again; batches that already completed are not repeated.',
      'Lower `max_batch` if the endpoint is slow, so each turn carries less input.',
      'Choose a faster model when timeouts recur on the same batch.',
    ],
    retryable: true,
  },
} as const satisfies Record<string, ErrorDefinition>
