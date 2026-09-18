# Acceptance

Validated on 2026-09-16 against the local vinext/Cloudflare development server, with a real Clerk development session, local D1, and remote Cloudflare Workers AI and Vectorize. **Auth provider cutover:** Cloudflare Access replaces Clerk; re-run the signed-in and MCP linking checks below after Access is configured and `scripts/remap-owner-id.sql` has been applied on production.

## Previously validated

- Sign-in, authenticated list, memory creation, editing to version 2, and retrieval of both history revisions (originally against Clerk; re-validate with Access).
- Personal token create/revoke, project-scoped refusal, and keyword search without Vectorize.
- MCP initialize, tools/list, and a successful `memory_search` with a personal token.
- Catalog settings, manual run, and proposal flow on Cloudflare.
- RFC 9457 problem documents and the `/errors` pages.

## Remaining deployment gates

- Production Cloudflare Access application (Managed OAuth enabled), final HTTPS origin, remote D1 migration, Worker `ACCESS_*` vars, and deployment.
- One-time owner remap via `scripts/remap-owner-id.sql` when migrating an existing Clerk library; then wait for Vectorize reindex.
- Automatically scheduled Cron execution in the deployed Worker (only manual local invocation tested).
- Manual Catalog runs, the Workflow instance, encrypted endpoint settings, and the live-model tool loop have run on Cloudflare. Automatic Cron dispatch on a `:00`/`:30` boundary remains a deployment gate, as do the signed-in browser acceptance steps below.
- Confirm the dispatch on the deployed Worker: an idle `:00`/`:30` window creates no Catalog Workflow; after creating or editing a memory, the next window should show one instance and a run with `trigger: "schedule"`. A Workflow `schedules` entry must not be reintroduced: on the Free plan it fails only at deploy time, as a partially applied trigger update.
- Real two-account isolation, expired Access sessions, and production sign-out behavior. Automated isolation tests cover the service layer, but do not replace these checks. Catalog management is session-only; confirm a personal token is refused by those endpoints, while `POST /api/v1/catalog/search` returns only categories backed by memories visible to its project scope.
- ChatGPT connection: developer mode enabled, `https://YOUR_ORIGIN/mcp` added, Access Managed OAuth approved, and `memory_search` returning a memory saved in the browser for the same account. The unsigned preview only proves that discovery fails closed and that the 401 challenge is present; it does not exercise a real Access OAuth flow.
- Access Managed OAuth settings as described in `docs/SETUP.md`: DCR / redirect allowlist including ChatGPT's stable callback, PKCE S256, RFC 8707. `pnpm oauth:check` must report a client registration method and `PKCE methods: S256`. Access does not advertise custom `memory:*` scopes; linked agents receive full memory access.
- RFC 9457 errors on the deployed origin: `curl -s -D - https://YOUR_ORIGIN/api/v1/memories` returns `content-type: application/problem+json`, and the `type` URL it prints loads the matching page (for example `https://YOUR_ORIGIN/errors/unauthorized`). The unsigned preview only proves the shape and the 503 path.
- A real `/api/v1/catalog/runs` trigger through the deployed Worker, and a manual run that is refused while another is in flight.
