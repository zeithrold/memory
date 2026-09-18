# Setup and credentials

The local shell, schema, unit/integration tests, and unsigned browser preview work without credentials. Real sign-in and remote semantic search require the steps below. **Do not paste secret keys into chat.** Enter them in the indicated local files or Wrangler prompts.

## 1. Install and run the local application

Use Node.js 24 and pnpm 10.33.0 (see `packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:3000. Without Cloudflare Access configuration, the UI shows setup instructions and cannot access private data. There is no development authentication bypass. D1 migrations here are **local only**.

## 2. Configure Cloudflare Access — first credential checkpoint

Production and any realistic login use [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/). Local `pnpm dev` stays unsigned until you set the public team domain (and still cannot complete a real Access login without Access in front of the hostname or `cloudflared`).

1. In Zero Trust, create a self-hosted (or MCP server) Access application on your Worker custom domain.
2. Add an Allow policy for your email (One-time PIN is enough for a single user).
3. Enable **Managed OAuth** under Advanced settings. Prefer a short access-token lifetime (5–15 minutes) and a longer grant session (1–2 weeks). Allow localhost/loopback clients for Codex/Cursor. Allowlist `https://chatgpt.com/connector_platform_oauth_redirect`.
4. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_ACCESS_TEAM_DOMAIN` to `https://<team>.cloudflareaccess.com`.
5. Copy `.dev.vars.example` to `.dev.vars`. Set `ACCESS_TEAM_DOMAIN` to the same value and `ACCESS_AUD` to the application Audience tag. Leave `APP_ORIGIN=http://localhost:3000`.
6. Restart `pnpm dev`. Against localhost the UI leaves setup mode when the public team domain is set, but API calls still need an Access JWT (or a personal `mem_*` token) until Access protects the deployed origin.

`.env.local` inlines the public team domain for the browser. `.dev.vars` supplies Worker configuration. Neither is committed. The Worker verifies `Cf-Access-Jwt-Assertion` (or the `CF_Authorization` cookie) with the team JWKS; there is no Access secret key.

Disabling an Access user does not automatically revoke this application's independent personal tokens; use the token revocation controls before offboarding. Automatic offboarding/webhooks are not part of this MVP.

### Migrating from Clerk (one-time)

Schema does not change: `owner_id` stays opaque text. Remap production rows from the Clerk `user_…` id to the Access `sub` with [`scripts/remap-owner-id.sql`](../scripts/remap-owner-id.sql). **Do not put this file under `migrations/`** (CI does not auto-apply D1; local tests and `migrations apply` would still run numbered files).

1. Deploy Access-aware code and configure Access on the hostname.
2. Sign in once through Access; decode `sub` from `Cf-Access-Jwt-Assertion`.
3. Read the old id: `wrangler d1 execute DB --remote --command "SELECT DISTINCT owner_id FROM memories"`.
4. Edit the two literals at the top of the SQL file locally (do not commit real IDs), then:

```sh
pnpm exec wrangler d1 execute DB --remote --file=scripts/remap-owner-id.sql
pnpm db:check-tenants:remote
```

5. Wait for the indexer Cron (or trigger scheduled processing) so Vectorize namespaces match the new `owner_id`.

## 3. Provision Cloudflare — second credential checkpoint

After signing in to your own Cloudflare account:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create shared-memory
pnpm exec wrangler vectorize create shared-memory --dimensions=1024 --metric=cosine
pnpm exec wrangler vectorize create-metadata-index shared-memory --property-name=project --type=string
```

Copy the D1 database ID into `wrangler.jsonc`, replacing the all-zero local placeholder. Add these bindings before inserting any vectors:

```json
{
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "shared-memory", "remote": true }],
  "ai": { "binding": "AI", "remote": true }
}
```

The checked-in configuration also declares `USAGE_ANALYTICS` (`memory_usage`) and two Rate Limiting bindings: `AUTH_RATE_LIMITER` namespace `7243101` at 300/minute and `API_RATE_LIMITER` namespace `7243102` at 120/minute. Keep those namespace IDs unique to these policies.

The embedding model is `@cf/baai/bge-m3`, with a validated 1024-dimensional output. Changing model/dimensions requires a new index and full reindex, not mixing old and new vectors. Both AI and Vectorize need account access and may incur usage charges. Local testing of these remote services also uses your account; they are deliberately absent from the initial no-credential configuration.

Vectorize requires `remote: true` for local development; it has no local simulation. Keep D1 local while testing with a dedicated development Vectorize index. Local Cron Triggers do not run automatically. After saving or editing a test memory, invoke the local scheduled handler explicitly:

```sh
curl --fail http://localhost:3000/cdn-cgi/local/scheduled
```

Check the Usage page for pending jobs. Vector visibility is eventually consistent even after the queue drains. This local-only development endpoint is provided by Cloudflare tooling, not by the application's public API. See [Cloudflare binding support](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).

Set `vars.APP_ORIGIN` to the exact HTTPS application origin. Choose the final Worker/custom domain first, and configure the matching Access application on that hostname. Use development resources for staging; do not reuse production D1/Vectorize between environments.

## 4. Configure production secrets and deploy

This step changes remote resources. Run it only when ready to deploy the chosen environment.

```sh
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
# Create an API token with only Account Analytics Read.
pnpm exec wrangler secret put ANALYTICS_READ_TOKEN
# Access team domain and AUD are ordinary vars (not secrets); set them in
# wrangler.jsonc / the dashboard, matching NEXT_PUBLIC_ACCESS_TEAM_DOMAIN.
# Run checks before deploying.
pnpm check
# Use the production Access team domain in .env.local or the build environment.
pnpm build
pnpm db:check-tenants:remote
pnpm exec wrangler d1 migrations apply DB --remote
pnpm db:check-tenants:remote
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

Set `NEXT_PUBLIC_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com` in the build environment or the ignored local env file **before building**. Set Worker `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` to match. Runtime secret values are entered through Wrangler, not committed in `wrangler.jsonc`.

The tenant check is read-only and prints only relationship names, counts and shortened identifiers. Any finding blocks the release: inspect and repair it manually before applying `0007_tenant_integrity.sql`; the migration never guesses an owner, moves a row, or deletes data.

The one-minute Cron Trigger processes up to 20 index jobs per invocation and retries provider failures with bounded exponential delay. The Usage page shows pending jobs. An authenticated `GET /api/v1/status` also reports retrying jobs. Publishing an embedding is eventually consistent; keyword search works before the vector becomes visible. Do not deploy with the local all-zero D1 ID, localhost origin, or missing AI/Vectorize bindings if semantic search is expected.

## 5. Configure the catalog agent

The catalog is optional and platform neutral: this service never pays for
inference, so nothing runs until an account supplies its own model endpoint.
See [Catalog](CATALOG.md) for why it is built this way.

```sh
# Required to store any per-account model credential. 64 hex characters.
openssl rand -hex 32 | pnpm exec wrangler secret put AGENT_SETTINGS_KEY
```

Without `AGENT_SETTINGS_KEY` the catalog stays readable and the settings
endpoint refuses to store a key (`AGENT_KEY_UNCONFIGURED`) instead of writing it
in plaintext. Changing the secret makes already stored credentials unreadable,
and they must be entered again.

The catalog needs its Workflow binding, which `wrangler.jsonc` already declares
as `memory-catalog`. There is deliberately **no `schedules` entry**: a scheduled
Workflow requires a paid Workers plan, and Cloudflare rejects the trigger
configuration for it after the upload. The Worker's existing minute Cron Trigger
performs a Catalog preflight on each 30-minute boundary and creates an instance
only when an account has actionable work, so the catalog runs on a timer without
paying for empty Workflow instances. `pnpm deploy` runs two guards before the upload:
`pnpm check:bundle`, because a Workflow binds by *exported class name* and a
bundle that stopped exporting `CatalogWorkflow` would deploy without error and
then never run, and `scripts/deploy-check.ts`, which refuses a `schedules` entry
because that failure only surfaces at deploy time otherwise.

Then, per account, in the **Catalog** tab (or over the API):

1. Enter the service-root URL of an endpoint that implements the OpenAI
   Responses API, a model, and an API key. Include the version path a provider
   documents, such as `https://api.openai.com/v1`, but do not include
   `/responses`; the service appends that resource path. The endpoint must
   support direct function tools, `tool_choice: "required"`, and
   `reasoning.effort: "none"`. Chat Completions-only endpoints are not accepted
   and there is no protocol fallback.
2. Press **Test connection**. The probe reports whether the endpoint answered
   *and* whether it called the probe tool through Responses API. Models that
   answer in prose but cannot call tools are rejected because the agent acts
   only through tools. Run this test again before enabling after any migration
   or endpoint/model change; the Responses migration clears the old Chat
   Completions probe result while preserving the saved credential and enabled
   state.
3. Save, then enable. The first scheduled run after enabling is a **dry run**: it records
   what would happen without changing categories, memberships, proposals or
   skips. It processes one batch and then pauses automatic runs in an
   `awaiting review` state. Disable the review gate after inspection to allow
   live scheduling; toggling it off and on allows one new scheduled preview.
   Manual dry runs still work while paused. Run intervals must be
   between 30 and 1,440 minutes in 30-minute increments; scheduled runs stay
   anchored to the `:00`/`:30` dispatch grid.

Budgets default to 6 memories per batch, 2 conversation turns, 8 tool calls per
turn, 4,096 completion tokens per model call, and 100,000 recorded model tokens
per UTC day. `maxBatch` must be at least two below `maxToolCalls`. Workers Free
allows 3,000 Workflow steps per day, and every turn costs two; with two owners
per active window the default worst case is 1,440 steps/day, while idle windows
cost zero Catalog Workflow steps. Manual runs may pass the daily token budget,
but the API and UI warn and still count their usage.

The tab also shows the taxonomy, the run history with a turn-by-turn replay of
every tool call, the suggestions waiting for a decision, and a button to undo a
run. It is reachable only with a browser session; an agent token cannot
reconfigure an endpoint or approve anything.

For local development, model endpoints on a loopback host may use plain HTTP
while `APP_ORIGIN` is itself a local origin. A hosted endpoint must be HTTPS, and
a redirect is refused so the credential is never forwarded to another host.

## 6. Connect clients

Create a separate token for each client, normally with `memory:read` and `memory:write`. Add `memory:delete` only if the client should fulfill explicit forgetting requests. Tokens expire after 90 days by default and can be restricted to one project. ChatGPT and other hosted agents link with OAuth instead of a copied token.

There are two distribution layers, and they solve different problems:

- The Agent Skill is the portable behaviour layer. It tells compatible agents when to retrieve context and when to run a bounded automatic capture pass. Run `npx skills add zeithrold/memory --skill shared-memory -g`, then select every detected compatible agent for a global install.
- The MCP server is the authenticated capability layer. It performs the actual reads and writes. A skill cannot create this trust relationship by itself.
- On ChatGPT and Codex, the combined plugin is the preferred distribution unit because one installation can carry both layers and start OAuth. On other hosts, install the skill and configure the MCP connection separately.

Credential helpers should collect the endpoint and token together, default the endpoint to `https://memory.ztd.me`, and keep the token in the host's credential store or environment rather than in the Skill text. Before enabling automatic retrieval/capture, send the credential to `GET <endpoint>/api/v1/status`. A `200` validates both values; require `credential.ready: true`, and show `credential.missingScopes` when read/write access is incomplete. Do not echo the token in commands, logs, prompts, or the status response.

The standalone Skill includes that helper. From the installed `shared-memory` directory, run:

```sh
node scripts/configure.mjs
node scripts/configure.mjs --check --json
```

The first command prompts for the endpoint and a hidden token, validates them, then atomically writes an owner-only plaintext JSON credential file under the platform config directory with mode `0600`. Environment values override the file. A token is deliberately not accepted as a command-line argument. The second command is the non-interactive preflight agents run before memory work; its output contains only endpoint, scopes and project restriction.

The helper cannot modify a running parent's environment. A local host whose MCP configuration reads `MEMORY_API_TOKEN` can be started with the saved credential without putting it in a command line:

```sh
node scripts/configure.mjs --run -- codex
```

This validates again and injects `MEMORY_API_ENDPOINT`, `MEMORY_BASE_URL`, and `MEMORY_API_TOKEN` only into the child process. It does not edit a host's MCP configuration; the Codex/Cursor snippets below still establish that connection.

Skill activation is model-driven, so it provides portable best-effort capture rather than a transactional guarantee. A host that requires every completed turn to be considered must run its own after-turn integration and call the same MCP or HTTP API; do not hide that stronger guarantee inside skill wording.

### ChatGPT

ChatGPT signs the user in through the authorization server; this application publishes only the resource half of the MCP authorization contract. Cloudflare Access Managed OAuth is the authorization server. Access issues opaque OAuth tokens to the client; the edge resolves them and forwards a `Cf-Access-Jwt-Assertion` that the Worker verifies.

`pnpm oauth:check` fetches Access authorization-server metadata and lists what is still missing. Run it after enabling Managed OAuth.

1. Protect the Worker hostname with an Access application and turn on **Managed OAuth**.
2. Allowlist `https://chatgpt.com/connector_platform_oauth_redirect` under allowed redirect URIs for dynamic clients.
3. Confirm DCR and PKCE S256:

```sh
pnpm oauth:check
```

It must report a client registration method and `PKCE methods: S256`. Access Managed OAuth requires the RFC 8707 `resource` parameter; ChatGPT's connector generally sends it. Access does **not** advertise custom `memory:*` scopes — a linked agent receives the same full memory access as a browser session (including forget).

Then connect:

1. In ChatGPT, open **Settings → Security and login** and turn on **Developer mode**.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button, and enter `https://YOUR_ORIGIN/mcp`.
3. ChatGPT reads the protected-resource metadata and opens the Access login. Approve. Nothing is copied by hand.
4. Confirm the tools appear, then ask ChatGPT to search a memory you saved on this site.

If no consent screen appears, check that `curl -s https://YOUR_ORIGIN/.well-known/oauth-protected-resource` returns JSON pointing at your Access team domain, that Managed OAuth is enabled, and that the ChatGPT redirect URI is allowlisted.

ChatGPT currently announces MCP revision `2026-07-28` and opens with `server/discover`, a method that revision makes mandatory. The pinned MCP SDK implements revisions up to `2025-11-25`, so `lib/server/mcp.ts` accepts an unknown `MCP-Protocol-Version` by serving the request with the revision this server implements rather than answering `400`, and `server/discover` is answered with `Method not found` so the client falls back to `initialize` (which negotiates down to `2025-11-25`). That compatibility shim keeps 2025-era clients working; adopting `@modelcontextprotocol/server` 2.x is the durable fix if a client ever requires the newer revision outright.

### Codex

Prefer Access OAuth on the production MCP URL (same as ChatGPT). Personal `mem_*` tokens remain for local or direct REST when Access is not in front:

```sh
codex mcp add shared_memory --url https://YOUR_ORIGIN/mcp
```

For a local/token fallback only: set `MEMORY_API_TOKEN` and use `--bearer-token-env-var MEMORY_API_TOKEN`. Behind Access, a bare Bearer `mem_*` never reaches the Worker.

Install the skill with `npx skills add zeithrold/memory --agent codex --skill shared-memory -g -y`, or copy `skills/shared-memory` into the client's discoverable skills directory. Installing a skill does not override host approval settings or guarantee every conversation will use it.

### Cursor

Configure a remote server in the supported global or project `mcp.json` for Access OAuth:

```json
{
  "mcpServers": {
    "shared_memory": {
      "url": "https://YOUR_ORIGIN/mcp"
    }
  }
}
```

A `headers.Authorization` Bearer `mem_*` entry is only for local/direct REST when Access does not protect the hostname.
Make the environment variable available to Cursor and install the same skill with `npx skills add zeithrold/memory --agent cursor --skill shared-memory -g -y`. Never commit a literal token in project configuration. GUI applications may not inherit your shell's environment; validate that in the actual client.

### DeepSeek

Use an MCP-capable agent host, or the Python tool-loop example in `examples/deepseek.py`. The model API does not execute memory tools itself. The example requires an independently supplied DeepSeek API key and has a bounded tool loop.

## 7. Package the plugin

The skill and the MCP server ship as one installable plugin. This is the primary ChatGPT/Codex distribution artifact; the standalone skill command above remains the cross-agent fallback. The generator reads the MCP URL from `wrangler.jsonc`, so the package cannot drift from the deployed origin:

```sh
pnpm plugin:build
# Against a staging or tunnel origin instead:
pnpm plugin:build -- --origin=https://staging.example.com
```

This writes `dist/plugin/shared-memory` — a portable `plugin.json`, an `mcp.json` pointing at `<origin>/mcp`, and the `shared-memory` skill — plus `dist/plugin/marketplace.json`. To install it for a personal marketplace, keep both copies in the marketplace root so the relative `source.path` stays valid:

```sh
mkdir -p ~/.agents/plugins
cp -R dist/plugin/shared-memory ~/.agents/plugins/shared-memory
cp dist/plugin/marketplace.json ~/.agents/plugins/marketplace.json
```

Merge the plugin entry into an existing `marketplace.json` rather than overwriting it. To bind the plugin to the MCP connection you already registered in ChatGPT, run OpenAI's `@plugin-creator` with that connection's `plugin_asdk_app…` id; it writes the `.app.json` mapping, which this generator deliberately does not invent.

Local marketplaces are for development and private distribution. For the lowest-friction public installation, submit the production HTTPS MCP endpoint and bundled skill as one plugin to the universal Plugins Directory after the credentialed acceptance checks pass. Do not advertise one-click installation before that listing is actually approved and visible.

## 8. Error monitoring (optional)

Sentry is wired into the Worker, the MCP endpoint, the Cron trigger, and the browser. Without a DSN every code path stays inert, which is how local development and the e2e preview run.

```sh
pnpm exec wrangler secret put SENTRY_DSN
# Local reporting is opt-in: put the same DSN in .dev.vars, and local failures
# arrive tagged environment=stage.
```

- **Two environments, one project**: local runs are `stage`, every deployment is `production`. The environment comes from `SENTRY_ENVIRONMENT` when set, otherwise from `APP_ORIGIN` (an `http` or localhost origin means `stage`). Scope alerts to `environment:production` so local noise never pages you.
- **Sampling**: traces are sampled at 1 on stage and 0.5 in production. `SENTRY_TRACES_SAMPLE_RATE` overrides both if quota becomes a concern. Errors are always sent.
- **What is captured**: request transactions (fetch), the Cron span plus a Sentry Crons heartbeat, D1 query spans, Workers AI spans, and MCP tool spans. Failures are reported only when the response is 5xx; 4xx is normal traffic.
- **What never leaves the deployment**: memory titles and content, search queries, request bodies, `Authorization`/`Cookie` headers, IP addresses and email addresses, and genAI inputs or outputs. The SDK runs with `sendDefaultPii: false`, and `lib/server/observability.ts` additionally strips those fields before sending. Error reports identify the account only by its opaque Access `sub`.
- **Project settings**: enable **Prevent Storing of IP Addresses** and leave request-body storage off as defence in depth.
- **Source maps**: with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` present at build time, `vite build` uploads source maps and deletes the client copies afterwards. Set `SENTRY_RELEASE` (CI uses the commit SHA) so the Worker and the uploaded artifacts agree; otherwise stack traces stay minified. `wrangler.jsonc` also enables Cloudflare's own `upload_source_maps`, which keeps stack traces readable in the Cloudflare dashboard.

## 9. Deployment acceptance

The automated `pnpm test:e2e` suite covers the unsigned preview and rejected unauthenticated requests. Build it with `NEXT_PUBLIC_ACCESS_TEAM_DOMAIN='' pnpm build` first. It runs the built Worker on port 3100 using `tests/e2e/wrangler.json`, which has only local bindings and no Cron, AI, Vectorize, or Access configuration. GitHub Actions builds this preview explicitly; the deployment step rebuilds separately with the production Access team domain. These tests do not need a Cloudflare API token.

- Sign in/out with real Access sessions; verify invalid/expired JWTs and unapproved origins are rejected.
- Two users cannot read, search, edit, delete, or inspect each other's history. A project-restricted token cannot read other projects, including `global`.
- Codex and Cursor initialize, list tools and perform real tool calls. Validate their actual supported protocol revisions against the pinned MCP SDK.
- Save a Chinese memory, wait for indexing, and retrieve it with an English/Chinese paraphrase. Score a small real-world retrieval set; local mock-vector tests cannot establish semantic quality.
- Edit during indexing and delete during embedding. Stale vectors must never return stale or deleted text.
- Verify Cron executes, provider failures retry, and revoked tokens stop working immediately.

Until these credentialed checks pass, local tests and builds do not establish deployment readiness.
