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
