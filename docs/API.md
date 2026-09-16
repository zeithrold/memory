# API v1

All endpoints require `Authorization: Bearer <credential>`. Browser calls use a Clerk session JWT; agents use personal `mem_…` tokens. Request/response JSON field names and machine error codes are English and stable across UI locales. Use HTTPS remotely. Errors have `error.code`, `error.message`, and optionally validation `fields`.

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
| GET | `/api/v1/usage` | session only | Daily operation/token aggregates, last 30 days, max 500 groups |
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

- 400/415: invalid fields, malformed JSON, unsupported content type.
- 401: missing, invalid, expired or revoked credential.
- 403: wrong scope, project restriction, disallowed origin, or a session-only endpoint.
- 404: absent or inaccessible memory. Another user's IDs are not disclosed.
- 409 `VERSION_CONFLICT`: reread and reconcile. `FORGOTTEN`: do not auto-recreate. `CONFLICT`: idempotency payload drift or duplicate content.
- 413: request exceeds 64 KiB.
- 429: retry after the supplied `Retry-After` interval.
- 503 `AUTH_NOT_CONFIGURED`: Clerk verification needs configuration.

Reuse a creation idempotency key only with its original payload. Do not blindly retry versioned updates/deletes or convert failed writes into success claims.

## MCP

`POST /mcp` uses JSON-RPC over Streamable HTTP. Send `Accept: application/json, text/event-stream`. Personal API tokens only. The SDK handles initialize, discovery and tool schema validation. Tools are advertised according to scopes, then authorized again by the shared service. Tool failures use MCP `isError` with the API error envelope. GET/DELETE transport methods return 405; this server has no protocol session to resume or delete.
