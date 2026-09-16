# API v1

All endpoints require `Authorization: Bearer <credential>`. Browser calls use a Clerk session JWT; agents use personal `mem_…` tokens. `/api/v1` accepts only those two, so an OAuth link cannot manage tokens. Request/response JSON field names and machine error codes are English and stable across UI locales. Use HTTPS remotely. Failures are RFC 9457 problem documents; see [Error handling](#error-handling).

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| GET | `/api/v1/memories?project=global&offset=0` | read | `{memories: […]}`, 30 per page |
| POST | `/api/v1/memories` | write | Memory, HTTP 201; exact retries return existing memory |
| GET | `/api/v1/memories/{id}` | read | Memory |
| PATCH | `/api/v1/memories/{id}` | write | Updated Memory |
| DELETE | `/api/v1/memories/{id}` | delete | HTTP 204 |
| GET | `/api/v1/memories/{id}/history` | read | Latest 50 revisions |
| POST | `/api/v1/search` | read | `{memories, mode, degraded}` |
| GET/POST | `/api/v1/tokens` | session only | Token list / one-time token secret |
| DELETE | `/api/v1/tokens/{id}` | session only | Revocation, HTTP 204 |
| GET | `/api/v1/usage` | session only | Daily operation/token/client aggregates, last 30 days, max 500 groups |
| GET | `/api/v1/status` | session only | Semantic configuration and per-user pending/retrying index jobs |

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
{ "query": "How should my Go services access SQL?", "project": "global", "limit": 8 }
```

`mode` is `hybrid` or `keyword`; `degraded: true` means semantic retrieval was unavailable. The service never sends a cross-project result simply because it is semantically similar.

## Token creation

```json
{ "name": "Codex Mac", "scopes": ["memory:read", "memory:write"], "project": null, "expiresInDays": 90 }
```

The returned `token` is available only in the creation response. List responses never contain the secret or digest. `project: null` allows all of the owner's projects; setting a string restricts access to that single project. Expiry is 1–365 days.

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

- 400 `INVALID_INPUT` / `INVALID_JSON` / `IMMUTABLE_PROJECT`, 415 `JSON_REQUIRED`: fix the request body. Unknown mutation fields are rejected, not ignored.
- 401 `UNAUTHORIZED`: missing, invalid, expired or revoked credential.
- 403 `FORBIDDEN` / `INSUFFICIENT_SCOPE` / `SESSION_REQUIRED` / `INVALID_ORIGIN`: wrong scope, project restriction, a session-only endpoint, or an origin that is not `APP_ORIGIN`. `INSUFFICIENT_SCOPE` means the OAuth link granted no memory scope at all.
- 404 `NOT_FOUND`: absent or inaccessible. Another account's identifiers are not disclosed.
- 405 `METHOD_NOT_ALLOWED`: read the `Allow` header.
- 409 `VERSION_CONFLICT`: reread and reconcile. `FORGOTTEN`: do not auto-recreate. `CONFLICT`: idempotency payload drift or duplicate content.
- 413 `BODY_TOO_LARGE`: request exceeds 64 KiB.
- 429 `RATE_LIMITED`: retry after the supplied `Retry-After` interval.
- 500 `INTERNAL_ERROR`: treat a mutation as uncertain and reuse its idempotency key when retrying a create.
- 503 `AUTH_NOT_CONFIGURED` / `INDEX_UNAVAILABLE`: deployment configuration, not a client error.

Reuse a creation idempotency key only with its original payload. Do not blindly retry versioned updates/deletes or convert failed writes into success claims.

## MCP

`POST /mcp` uses JSON-RPC over Streamable HTTP. Send `Accept: application/json, text/event-stream`. Credentials are either a personal API token or a Clerk OAuth access token; a browser session is not accepted. The SDK handles initialize, discovery and tool schema validation. Tools are advertised according to the credential's scopes, and every tool call is authorized again by the shared service. Tool failures use MCP `isError` with the API error envelope. GET/DELETE transport methods return 405; this server has no protocol session to resume or delete.

Every tool advertises an `outputSchema` and every successful call returns the matching `structuredContent`, so a host can read fields such as `id` and `version` without parsing text. The serialized JSON is still returned in a `TextContent` block because the MCP specification asks tools that return structured content to keep it for clients that predate `structuredContent`. A declared output schema is strict: a result that does not match it becomes an `isError` tool result rather than silently reaching the model.

## OAuth discovery

Clerk issues the tokens; this application publishes only the resource-server half of the MCP authorization contract.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/.well-known/oauth-protected-resource` | RFC 9728 metadata; `resource` is the application origin |
| GET | `/.well-known/oauth-protected-resource/mcp` | Same document with `resource` set to the `/mcp` URL |
| OPTIONS | Either path | CORS preflight; both are public and cacheable for 5 minutes |

Both documents list the Clerk instance derived from `CLERK_ISSUER` or the publishable key in `authorization_servers`, and advertise `memory:read`, `memory:write`, `memory:delete` in `scopes_supported`. Without a configured Clerk instance they return 503 `AUTH_NOT_CONFIGURED`.

`GET`/`POST /mcp` without a valid credential returns 401 with `WWW-Authenticate: Bearer resource_metadata="…", scope="memory:read memory:write"`, which is what lets an MCP host start the OAuth flow. A verified OAuth token whose scopes do not cover the requested tool returns MCP `isError` with `_meta["mcp/www_authenticate"]` carrying `error="insufficient_scope"` and the scope that is missing, so the host can ask for a re-link instead of silently failing. Each advertised tool carries `securitySchemes` describing the scope it needs.
