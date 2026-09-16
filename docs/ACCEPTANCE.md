# Credentialed MVP acceptance

Validated on 2026-09-16 against the local vinext/Cloudflare development server, with a real Clerk development session, local D1, and remote Cloudflare Workers AI and Vectorize.

## Passed

- Clerk sign-in, authenticated list, memory creation, editing to version 2, and retrieval of both history revisions.
- Synthetic Chinese memory isolated in project `mvp-acceptance`, with an explicit test-only source and tags.
- A one-day, read-only personal token restricted to that project. REST reads succeeded; another project, valid writes, and token management were denied.
- MCP initialization, permission-filtered discovery (`memory_get` and `memory_search` only), and reading via JSON-RPC over HTTP.
- Official MCP SDK Streamable HTTP client connection, tool discovery, and Chinese search.
- A manually triggered local scheduled invocation drained the index queue. The remote index has 1024 dimensions and a string `project` metadata index.
- An English query (`Documentation language and translation support`) retrieved the Chinese memory with `mode: hybrid` and `degraded: false`. This is a smoke test, not a retrieval-quality benchmark.
- Usage page showed calls, intentionally rejected requests, and zero pending index jobs.
- The temporary personal token was revoked. Subsequent REST and MCP requests using it returned 401 immediately.

The synthetic memory and its revisions remain available for inspection. Its vector is in the configured development index. The temporary token is revoked; no usable token is stored in this document or source files.

## Remaining deployment gates

- Production Clerk application, final HTTPS origin, remote D1 migration, Worker secrets, and deployment.
- Automatically scheduled Cron execution in the deployed Worker (only manual local invocation tested).
- Real two-account isolation, expired Clerk sessions, and production sign-out behavior. Automated isolation tests cover the service layer, but do not replace these checks.
- Codex and Cursor application connections. SDK compatibility alone does not prove each application's configuration.
- DeepSeek tool-loop execution with a user-provided API key.
- A representative multilingual retrieval-quality benchmark and remote edit/delete race testing.
- ChatGPT connection: developer mode enabled, `https://YOUR_ORIGIN/mcp` added, Clerk consent approved over OAuth, and `memory_search` returning a memory saved in the browser for the same account. The unsigned preview only proves that discovery fails closed and that the 401 challenge is present; it does not exercise a real Clerk OAuth token.
- Clerk OAuth application settings as described in `docs/SETUP.md`: custom scopes created and advertised, default scopes excluding `memory:delete`, and DCR published (or CIMD, or a predefined client). `pnpm oauth:check` must report a client registration method, `PKCE methods: S256`, and all three memory scopes. The instance metadata was read on 2026-09-16 and advertises `authorization_response_iss_parameter_supported: true`, so the stable ChatGPT callback applies; DCR and the scopes were still missing at that time.
- An OAuth link granted only `memory:read` receiving the tool-level `insufficient_scope` challenge when a write is attempted, and a link with `memory:delete` completing a forget request.
- `pnpm plugin:build` output installed from a local marketplace, with the bundled skill and MCP server both active in the host.
- RFC 9457 errors on the deployed origin: `curl -s -D - https://YOUR_ORIGIN/api/v1/memories` returns `content-type: application/problem+json`, and the `type` URL it prints loads the matching page (for example `https://YOUR_ORIGIN/errors/unauthorized`). The unsigned preview only proves the shape and the 503 path.
- Structured tool results are unverified against a real host. The automated tests prove that every advertised tool carries an `outputSchema`, that successful calls return matching `structuredContent`, and that `serialize()` cannot drift from `memorySchema`; they do not prove how ChatGPT renders or uses it. After connecting, re-scan the connector and confirm the missing-output-schema suggestion is gone, then run one `memory_search` and check that the host can reuse the returned identifiers.
- Sentry reporting is unverified until a DSN exists. The automated tests cover the environment mapping, sampling values, scrubbing, and the 5xx-only capture rule, but they do not send events. Before relying on it: confirm a production failure arrives with `environment=production`, a release equal to the commit, and a stack trace that maps to source; confirm a local failure arrives as `environment=stage` at full sampling; confirm the Cron monitor shows heartbeats; and inspect a trace containing `memory_create` and `memory_search` field by field to verify that no memory text, search query, token, or email address is present.
