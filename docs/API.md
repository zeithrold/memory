# API v1

All endpoints require `Authorization: Bearer <credential>`. Browser calls use a Clerk session JWT; agents use personal `mem_…` tokens. Those are the normal `/api/v1` credentials. The read-only `/api/v1/status` preflight also accepts a Clerk OAuth access token, but an OAuth link still cannot reach token or account management. Request/response JSON field names and machine error codes are English and stable across UI locales. Use HTTPS remotely. Failures are RFC 9457 problem documents; see [Error handling](#error-handling).

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| GET | `/api/v1/memories?project=global&offset=0` | read | `{memories: […]}`, 30 per page |
| POST | `/api/v1/memories` | write | Memory, HTTP 201; exact retries return existing memory |
| GET | `/api/v1/memories/{id}` | read | Memory |
| PATCH | `/api/v1/memories/{id}` | write | Updated Memory |
| DELETE | `/api/v1/memories/{id}` | delete | HTTP 204 |
| GET | `/api/v1/memories/{id}/history` | read | Latest 50 revisions |
| POST | `/api/v1/search` | read | `{memories, mode, degraded, catalog}` |
| GET/POST | `/api/v1/tokens` | session only | Token list / one-time token secret |
| DELETE | `/api/v1/tokens/{id}` | session only | Revocation, HTTP 204 |
| GET | `/api/v1/usage` | session only | `{usage, degraded}`: daily operation/token/client aggregates, last 30 days, max 500 groups |
| GET | `/api/v1/status` | authenticated | Canonical endpoint, MCP URL, granted scopes, readiness and project-scoped index status |
| GET | `/api/v1/catalog` | session only | Account-wide two-level catalog: categories, counts, pending proposals |
| POST | `/api/v1/catalog/search` | read | Project-filtered matching categories and visible member counts |
| GET/PUT | `/api/v1/catalog/settings` | session only | Model endpoint, budgets and privacy settings; the credential is write-only |
| POST | `/api/v1/catalog/settings/test` | session only | Live probe: reachable, model accepted, tool calling supported |
| GET | `/api/v1/catalog/runs?limit=20` | session only | Run history |
| POST | `/api/v1/catalog/runs` | session only | Starts a run (202). `{dryRun: true}` records without changing anything |
| GET | `/api/v1/catalog/runs/{id}` | session only | Run replayed turn by turn, with every tool call and its decision |
| POST | `/api/v1/catalog/runs/{id}/revert` | session only | Undoes the effects that run applied |
| GET | `/api/v1/catalog/proposals?status=pending` | session only | Structural suggestions awaiting a decision |
| POST | `/api/v1/catalog/proposals/{id}` | session only | `{decision: "approve" \| "reject"}` |
| GET | `/api/v1/catalog/metrics` | session only | Daily rollups plus lifetime totals |

## Credential preflight

Installers and agents can validate an endpoint and credential without making a memory call:

```sh
curl -sS https://memory.ztd.me/api/v1/status \
  -H "Authorization: Bearer $MEMORY_API_TOKEN"
```

A `200` response proves that the endpoint accepted the credential. `credential.ready` is `true` only when both `memory:read` and `memory:write` are granted; otherwise `credential.missingScopes` lists what the automatic retrieval/capture workflow still needs. `credential.project` reports a personal token's project restriction, and the index counts are filtered to that project. The response never returns the owner identifier, token identifier, credential secret, or memory content.

```json
{
  "endpoint": "https://memory.ztd.me",
  "mcpUrl": "https://memory.ztd.me/mcp",
  "credential": {
    "ready": true,
    "scopes": ["memory:read", "memory:write"],
    "missingScopes": [],
    "project": null
  },
  "semanticEnabled": true,
  "index": { "pending": 0, "retrying": 0 }
}
```

## Create / update

```json
{
  "project": "global",
  "title": "Database access preference",
  "content": "Prefer sqlc and pgx rather than an ORM for Go services.",
  "kind": "preference",
  "tags": ["go", "database"],
  "source": "User explicitly confirmed this preference on 2026-09-16.",
  "idempotencyKey": "6a67360d-6167-42bc-8bb4-20c121642494"
}
```

Updates replace the editable fields, omit `idempotencyKey` and add `expectedVersion`. Deletes accept only `expectedVersion`. UUID identifiers, length bounds, types, and scope enums are enforced by shared Zod schemas in `lib/contracts.ts`; unknown mutation fields are rejected.

## Search

```json
{
  "query": "How should my Go services access SQL?",
  "project": "global",
  "limit": 8,
  "categoryIds": ["6a67360d-6167-42bc-8bb4-20c121642494"],
  "mode": "flat",
  "balance": "sqrt"
}
```

`mode` is `hybrid` or `keyword`; `degraded: true` means semantic retrieval was unavailable. The service never sends a cross-project result simply because it is semantically similar.

`categoryIds` explicitly scopes retrieval to catalog categories chosen by the caller. A depth-1 category includes its depth-2 children; a depth-2 category includes only itself. Use `POST /api/v1/catalog/search` first when a broad question needs topic discovery:

```json
{
  "query": "database conventions",
  "project": "global",
  "limit": 5
}
```

It returns only categories backed by memories visible in that project, including each category's path, boundary and `visibleMemberCount`. This is the normal agent retrieval path; `GET /api/v1/catalog` is the account-wide browser/admin view, not a document to inject into model context.

Two optional fields route the query through the catalog. `mode: "catalog"` narrows candidates to the categories the query matches best and balances the budget between them, so a large category cannot crowd out a small one; the flat ranking is always fused in, so a routing miss costs ranking quality and never recall. `balance` picks the allocation rule (`equal`, `sqrt` — the default — or `neyman`) and is only consulted when routing. The response reports what happened:

```json
{
  "memories": [],
  "mode": "hybrid",
  "degraded": false,
  "catalog": {
    "routed": true,
    "balance": "sqrt",
    "categories": [{ "id": "…", "label": "Backend", "candidates": 6 }]
  }
}
```

`catalog` is `null` for a flat search. `routed: false` means no category matched the query and the result is exactly what `flat` would have returned. See [Catalog](CATALOG.md) for why routing is opt-in.

## Token creation

```json
{ "name": "Codex Mac", "scopes": ["memory:read", "memory:write"], "project": null, "expiresInDays": 90 }
```

The returned `token` is available only in the creation response. List responses never contain the secret or digest. `project: null` allows all of the owner's projects; setting a string restricts access to that single project. Expiry is 1–365 days.

## Usage telemetry

`GET /api/v1/usage` merges the retained D1 history with new Analytics Engine aggregates. `degraded: true` means the Analytics SQL API was unavailable or its read credentials were not configured; the `usage` array still contains the available legacy rows. This endpoint is operational telemetry, not a billing ledger.

New requests do not insert into D1 `usage_events` or `rate_limits`. Analytics points contain only the owner index, token/client identifiers, a stable operation name, latency, and an error flag. They never contain memory text, search terms, token secrets, IP addresses, email addresses, or request bodies.

## Error handling

Every failure is an RFC 9457 problem document served as `application/problem+json`, one page per error at `/errors/<slug>`:

```json
{
  "type": "https://memory.ztd.me/errors/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "detail": "The memory changed. Read it again before editing.",
  "instance": "/api/v1/memories/9f1c0f7e-4a1e-4a1e-9f1c-0f7e4a1e4a1e",
  "code": "VERSION_CONFLICT"
}
```

`code` is the stable machine identifier and the only member guaranteed identical across deployments; branch on it. `type` is the absolute documentation URL for the origin that answered, `title` and `status` are fixed per code, `detail` describes this occurrence, and `instance` is the request path without its query string. Validation failures add `fields: [{ path, message }]`. The full catalog is listed at `/errors`.

This replaces the earlier `{ "error": { "code", "message" } }` envelope.

- 400 `INVALID_INPUT` / `INVALID_JSON` / `IMMUTABLE_PROJECT` / `PROVIDER_ENDPOINT_INVALID`, 415 `JSON_REQUIRED`: fix the request body. Unknown mutation fields are rejected, not ignored. `IMMUTABLE_PROJECT` still applies to updates: a memory's project changes only when a user approves a catalog proposal.
- 401 `UNAUTHORIZED`: missing, invalid, expired or revoked credential.
- 403 `FORBIDDEN` / `INSUFFICIENT_SCOPE` / `SESSION_REQUIRED` / `INVALID_ORIGIN`: wrong scope, project restriction, a session-only endpoint, or an origin that is not `APP_ORIGIN`. `INSUFFICIENT_SCOPE` means the OAuth link granted no memory scope at all. Catalog management endpoints are session-only; `POST /api/v1/catalog/search` is the read-only exception and applies the same project restriction as memory search.
- 404 `NOT_FOUND` / `RUN_NOT_FOUND`: absent or inaccessible. Another account's identifiers are not disclosed.
- 405 `METHOD_NOT_ALLOWED`: read the `Allow` header.
- 409 `VERSION_CONFLICT`: reread and reconcile. `FORGOTTEN`: do not auto-recreate. `CONFLICT`: idempotency payload drift or duplicate content. `AGENT_NOT_CONFIGURED` / `CATALOG_DISABLED`: the account has no model endpoint, or this deployment declares no catalog Workflow. `RUN_IN_PROGRESS`: runs are serialized per account.
- 413 `BODY_TOO_LARGE`: request exceeds 64 KiB.
- 429 `RATE_LIMITED`: retry after the supplied `Retry-After` interval.
- 500 `INTERNAL_ERROR`: treat a mutation as uncertain and reuse its idempotency key when retrying a create.
- 502 `PROVIDER_ERROR` / `PROVIDER_TOOL_UNSUPPORTED` / `PROVIDER_OUTPUT_INCOMPLETE`, 504 `PROVIDER_TIMEOUT`: the configured Responses API endpoint failed, cannot call tools, or stopped before producing a complete function call.
- 503 `AUTH_NOT_CONFIGURED` / `AGENT_KEY_UNCONFIGURED` / `INDEX_UNAVAILABLE`: deployment configuration, not a client error. `AGENT_KEY_UNCONFIGURED` means the deployment has no `AGENT_SETTINGS_KEY`, so a per-account credential cannot be encrypted and is refused rather than stored in plaintext.

Reuse a creation idempotency key only with its original payload. Do not blindly retry versioned updates/deletes or convert failed writes into success claims.

## MCP

`POST /mcp` uses JSON-RPC over Streamable HTTP. Send `Accept: application/json, text/event-stream`. Credentials are either a personal API token or a Clerk OAuth access token; a browser session is not accepted. The SDK handles initialize, discovery and tool schema validation. Tools are advertised according to the credential's scopes, and every tool call is authorized again by the shared service. Tool failures use MCP `isError` with the API error envelope. GET/DELETE transport methods return 405; this server has no protocol session to resume or delete.

Every tool advertises an `outputSchema` and every successful call returns the matching `structuredContent`, so a host can read fields such as `id` and `version` without parsing text. The serialized JSON is still returned in a `TextContent` block because the MCP specification asks tools that return structured content to keep it for clients that predate `structuredContent`. A declared output schema is strict: a result that does not match it becomes an `isError` tool result rather than silently reaching the model.

`memory_catalog_search` performs project-filtered topic discovery. Its category identifiers can be passed to `memory_search.categoryIds` for explicit scoped retrieval. The legacy `memory_catalog` tool returns the account-wide tree for browsing and diagnostics; it is not advertised to project-restricted credentials.

## OAuth discovery

Clerk issues the tokens; this application publishes only the resource-server half of the MCP authorization contract.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/.well-known/oauth-protected-resource` | RFC 9728 metadata; `resource` is the application origin |
| GET | `/.well-known/oauth-protected-resource/mcp` | Same document with `resource` set to the `/mcp` URL |
| OPTIONS | Either path | CORS preflight; both are public and cacheable for 5 minutes |

Both documents list the Clerk instance derived from `CLERK_ISSUER` or the publishable key in `authorization_servers`, and advertise `memory:read`, `memory:write`, `memory:delete` in `scopes_supported`. Without a configured Clerk instance they return 503 `AUTH_NOT_CONFIGURED`.

`GET`/`POST /mcp` without a valid credential returns 401 with `WWW-Authenticate: Bearer resource_metadata="…", scope="memory:read memory:write"`, which is what lets an MCP host start the OAuth flow. A verified OAuth token whose scopes do not cover the requested tool returns MCP `isError` with `_meta["mcp/www_authenticate"]` carrying `error="insufficient_scope"` and the scope that is missing, so the host can ask for a re-link instead of silently failing. Each advertised tool carries `securitySchemes` describing the scope it needs.
