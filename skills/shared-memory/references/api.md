# HTTP fallback

Use the service's configured HTTPS base URL. Read `MEMORY_API_TOKEN` from the environment; never include it in prompts, source code, URLs, or output. Send `Authorization: Bearer <token>` and `Content-Type: application/json`.

## Credential helper

The bundled `scripts/configure.mjs` provides a host-neutral setup and preflight path:

```sh
# Interactive: hidden token prompt, endpoint defaults to https://memory.ztd.me
node scripts/configure.mjs

# Agent/session preflight; JSON output is safe to inspect
node scripts/configure.mjs --check --json

# Start a local agent with the saved values injected as environment variables
node scripts/configure.mjs --run -- codex
```

The helper uses `MEMORY_API_ENDPOINT` (or the compatible `MEMORY_BASE_URL`) and `MEMORY_API_TOKEN` as overrides. Otherwise it reads `$XDG_CONFIG_HOME/shared-memory/credentials.json`, `%APPDATA%/shared-memory/credentials.json` on Windows, or `~/.config/shared-memory/credentials.json`. This is an owner-only plaintext JSON credential file, written atomically with mode `0600`; the helper refuses a more permissive file on POSIX. The token is never accepted on the command line or printed. `--config FILE` selects a different file.

Configuration always calls `/api/v1/status` before saving. It refuses redirects, invalid tokens, non-JSON responses, and credentials missing `memory:read` or `memory:write`. `--run` validates again, then injects `MEMORY_API_ENDPOINT`, `MEMORY_BASE_URL`, and `MEMORY_API_TOKEN` into the child without exposing the token in its argument list. It cannot change the environment of an already running agent or write that host's MCP configuration; restart through `--run` or configure the host's documented secret store when it needs an environment variable.

| Operation | Endpoint | Body |
| --- | --- | --- |
| Check credential | `GET /api/v1/status` | None |
| Search catalog | `POST /api/v1/catalog/search` | `query`, `project` (default `global`), `limit` (1–10, default 5) |
| Search memories | `POST /api/v1/search` | `query`, `project` (default `global`), optional `categoryIds` (1–5), `limit` (1–20, default 8) |
| Read | `GET /api/v1/memories/{id}` | None |
| Create | `POST /api/v1/memories` | Memory fields and UUID `idempotencyKey` |
| Update | `PATCH /api/v1/memories/{id}` | Memory fields and integer `expectedVersion` |
| Forget | `DELETE /api/v1/memories/{id}` | Integer `expectedVersion` |

Run the credential check before the first memory operation in a session. HTTP `200` means the endpoint accepted the bearer token. Require `credential.ready: true` for automatic retrieval and capture; if it is false, surface `credential.missingScopes`. The response also returns the canonical `endpoint`, `mcpUrl`, granted `scopes`, optional project restriction, and project-scoped indexing counts. It never returns the token or memory content.

Memory fields: `title` (1–160 characters), `content` (1–6000), `kind` (`preference`, `fact`, `decision`, `experience`), `project` (1–64 ASCII letters/digits/underscore/dot/hyphen), `tags` (up to 12 strings, each 1–40), and `source` (1–1000). Whitespace-only text is invalid. Default project is `global`; default tags are empty.

Errors are RFC 9457 problem documents (`application/problem+json`): `type` links to a page under `/errors/<slug>`, `title` and `status` describe the error kind, `detail` describes this request, and `code` is the stable identifier to branch on. Validation failures add `fields`. Handle 401 by fixing credentials, 403 by fixing permissions (or re-linking when `code` is `INSUFFICIENT_SCOPE`), 409 by rereading/reconciling, and 429 by waiting for `Retry-After`. Never automatically retry a changed mutation payload. Treat a 5xx mutation result as uncertain and reuse its idempotency key when retrying a create.

Catalog search returns project-visible category metadata, paths, and `visibleMemberCount`. Passing a depth-1 category to memory search includes its depth-2 children; a depth-2 category includes only itself. Memory search returns `memories`, `mode` (`hybrid` or `keyword`), and `degraded`. MCP memory search truncates content to 500 characters; HTTP search returns full entries. Do not send arbitrary user-provided URLs as the service endpoint.
