# Architecture

Shared Memory is a multi-user, personal memory service. Each user's agents share that user's context; users do not share each other's memories. The MVP stores concise text entries, not attachments or full transcripts.

## Components

- vinext App Router on Cloudflare Workers, with a custom Worker entry exporting the scheduled index processor.
- Cloudflare Access for sign-in at the edge. The Worker verifies `Cf-Access-Jwt-Assertion` (or the `CF_Authorization` cookie) with the team JWKS. Browser API requests use `credentials: 'include'`; personal `mem_*` Bearer tokens remain for local/REST. APIs do not treat an unverified cookie as identity.
- Stateless MCP Streamable HTTP at `/mcp`, using the official MCP SDK's Web Standards transport. Each request creates its own server/transport and closes it after the JSON response completes. SDK protocol compatibility is pinned in the lockfile; no legacy SSE endpoint is implemented. Because the pinned SDK implements revisions up to `2025-11-25` and rejects any other `MCP-Protocol-Version` before dispatch, `negotiatedRequest` drops an unrecognised version so a newer client can still negotiate down through `initialize`, and its `server/discover` call is answered with `Method not found` instead of a transport-level `400`.
- The MCP authorization contract is implemented on the resource-server side only. Cloudflare Access Managed OAuth remains the authorization server. `/.well-known/oauth-protected-resource` (and its `/mcp` path variant) publishes RFC 9728 metadata naming the Access team domain, and a 401 or 403 on `/mcp` (when Access is not intercepting) returns a `WWW-Authenticate` challenge that points at it. With Managed OAuth enabled, Access owns the non-browser 401 challenge instead. The pinned MCP SDK predates per-tool `securitySchemes`, so the advertised tool list — including each tool's `outputSchema` — is emitted by `lib/server/mcp.ts` instead of by `McpServer`. The SDK still validates every successful result against that schema, and the serialized JSON stays in `content` for hosts that predate structured content.
- REST at `/api/v1`, with one explicit App Router module per public path and a shared `defineApiRoute` wrapper for authentication, two-stage rate limiting, secure headers, RFC 9457 errors and usage telemetry. Route files parse transport input and call the same named service functions as MCP; there is no catch-all string dispatcher.
- D1 is authoritative. SQLite triggers maintain FTS, revisions and the outbox in the same transaction as mutations. Tenant-integrity triggers reject cross-owner parents, memberships, run children, proposals/evidence, skip/review rows and legacy usage/token relationships, and prevent root entities from changing owner.
- Workers AI bge-m3 (1024 dimensions) and Vectorize cosine similarity. Namespace is derived from the authenticated owner; the project metadata index narrows candidates. Hydration checks tenant, project, current version and deletion status in D1.
- A Cloudflare Workflow maintains a two-level memory catalog on a 30-minute schedule, driven by a tool-calling loop against a model endpoint the account supplies. Its actions land in an append-only audit table that doubles as the loop's transcript and its idempotency journal. See [Catalog](CATALOG.md).

## Data and lifecycle

Memories include owner, project, title, content, kind, tags, evidence/source, version and timestamps. Projects are user-local ASCII keys; `global` is the personal cross-project scope. Clients search global and project separately. Token restrictions never expand automatically.

Creation has a UUID idempotency key and an exact normalized title/content fingerprint scoped to user and project. Same content with conflicting metadata returns a conflict for reconciliation. Updates use optimistic compare-and-swap; the project is immutable. Revisions keep previous text and provenance.

Forgetting clears active text, tags, source, FTS and history in the same transaction, retaining the ID, timestamps and current content fingerprint as a tombstone. This prevents exact recreation of that version. It is not semantic deduplication: paraphrases and older pre-edit versions are not automatically blocked. The skill must honor forgetting beyond exact server matching. Provider backups and platform retention are separate from logical deletion.

Each mutation inserts an index job. Vector IDs include version. Workers never rely on successful Vectorize submission as proof of immediate search visibility. Processing is idempotent, checks after embedding for concurrent changes, removes previous-version vectors, and retries failures. A missing provider leaves work pending and search falls back to keywords. Jobs are not silently dropped after a retry limit. Vector metadata contains project only, not body text.

Keyword indexing adds explicit CJK unigrams/bigrams and Latin/code tokens before FTS5. This is a lightweight baseline, not linguistic segmentation. RRF combines keyword and vector ranks. Search returns only up to 20 entries; MCP previews are capped at 500 characters per entry. Catalog discovery is a separate read path: it scores short category metadata, filters categories and counts through memories visible in the requested project, and returns identifiers that can explicitly scope memory search. The account-wide catalog snapshot is retained for the UI and diagnostics rather than used as the normal model-retrieval payload.

## Identity and access

API keys are 256-bit random secrets with SHA-256 digests in D1. They are revealed once, independently revocable, scoped to read/write/delete, and optionally one project. Management and usage endpoints require an Access session (not a personal token). Owner IDs always come from verified credentials, never request bodies. Revoked/expired keys are checked on every request. Removing a user from Access does not automatically revoke independent keys in the MVP; revoke them before offboarding.

Each entry point accepts an explicit set of credential kinds. `/api/v1` accepts an Access JWT (session) or a personal token; `/mcp` accepts a personal token or an Access JWT (via Managed OAuth). An Access-linked agent therefore cannot reach token management, and `requireSession` keeps its meaning without inspecting the token's shape. Access JWTs carry identity only; the Worker grants the full `memory:read|write|delete` set to Access identities. Personal tokens still enforce their stored scopes. Origin checks guard session credentials only: machine clients may send no Origin, and `/mcp` does not require the application Origin header, so requiring it there would reject legitimate agent hosts.

Origins are checked when supplied; machine clients may omit Origin. Responses are `no-store` and JSON bodies are bounded at 64 KiB. Cloudflare Rate Limiting runs before authentication at 300 requests per edge location/IP/minute and again after authentication at 120 requests per owner/minute across all tokens. These eventually consistent abuse controls are not billing quotas.

New usage points go to the `memory_usage` Analytics Engine dataset and hold an owner index, token ID, OAuth client ID, stable operation, duration and error flag, never memory content or full queries. Dashboard queries use `_sample_interval`, merge the result with the retained 30-day D1 history, and degrade to legacy data if Analytics is unavailable. The old `usage_events` and `rate_limits` tables remain temporarily for rollback/history but receive no new request-path writes. MCP records actual tool calls, not initialization/discovery traffic. Usage persistence is best effort; memory correctness does not depend on analytics availability.

Personal-token `last_used_at` is updated at most once per hour and is attached to the request with `waitUntil`; failures are logged with a shortened token identifier and do not fail the API request.

## Observability

Sentry (optional; every path stays inert without `SENTRY_DSN`) wraps the Worker with `withSentry`, which instruments `fetch` and `scheduled` in place and proxies `env` so D1 and Workers AI calls produce spans without touching call sites. The MCP server is wrapped with `wrapMcpServerWithSentry` using `recordInputs: false` and `recordOutputs: false`, and the Cron handler adds a Sentry Crons heartbeat around `maintenance()`.

Only 5xx responses are reported: `errorResponse` is the single funnel for API, MCP, and discovery failures, so 4xx traffic never reaches Sentry. Reports carry the problem `code`, the status, and the HTTP method as tags, and identify the account by opaque Access `sub` only.

Environments are `stage` (any http or localhost origin, including the e2e preview) and `production` (any deployment), with trace sampling of 1 and 0.5 respectively. `lib/server/observability.ts` deliberately does **not** pass `dataCollection`: supplying it would reset every unspecified field to Sentry's permissive defaults, so the SDK runs with `sendDefaultPii: false` and a `beforeSend`/`beforeSendTransaction` scrub removes request bodies, cookies, query strings, credentials, user contact fields, and genAI content attributes as defence in depth. Documentation and OAuth discovery transactions are dropped outright.

## Internationalization

English is the default UI and documentation language. Typed English/zh-CN dictionaries guarantee matching keys. A locale cookie controls server-rendered `lang`; client switching updates it. Dates use `Intl`. Protocol identifiers/error codes remain stable English, and server error messages are currently English. Memory content remains in the language supplied by the user.

The workspace uses real routes: `/memories`, `/memories/[id]`, `/catalog`, `/tokens`, `/usage`, and `/connect`; `/` redirects to `/memories`. A shared client shell owns locale, observability, toast and auth state but accepts page content as children. Navigation disables prefetch, and each route imports only its own business Client Component so the memories entry path does not fetch management-page chunks.

## Deliberate MVP limits

No team sharing, attachments, document ingestion, semantic conflict resolution, subscriptions, billing, a self-hosted authorization server, per-project OAuth scoping, automatic Access offboarding, or organization administration. The authenticated user's chosen agent extracts facts. Evidence quality cannot be guaranteed by schema validation alone.

The catalog agent is the one server-side LLM in the system, and it is deliberately the narrowest one that is useful: it classifies existing memories through tools and never writes memory text. It does not extract facts from documents, does not rewrite entries, does not delete anything, and does not move a memory between projects without a human approving a proposal. The platform never pays for its inference — an account that configures no endpoint simply has no catalog.

## Production bundling compatibility

The initial vinext beta.10 / Vite 8.3 build removed the application's client-boundary exports from both SSR and browser chunks, producing an undefined component and HTTP 500. Export-preservation alone did not resolve it. The Vite configuration temporarily disables tree-shaking for the client and SSR environments; server/RSC optimization remains enabled. This increases bundle size. Keep the production browser smoke tests as the removal gate when upgrading the toolchain. No dependencies are patched.
