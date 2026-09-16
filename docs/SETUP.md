# Setup and credentials

The local shell, schema, unit/integration tests, and unsigned browser preview work without credentials. Real sign-in and remote semantic search require the steps below. **Do not paste secret keys into chat.** Enter them in the indicated local files or Wrangler prompts.

## 1. Install and run the local application

Use Node.js 24 and pnpm 10.33.0 (see `packageManager`).

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:3000. Without Clerk configuration, the UI shows setup instructions and cannot access private data. There is no development authentication bypass. D1 migrations here are **local only**.

## 2. Configure a Clerk development application — first credential checkpoint

1. Create an application in the [Clerk Dashboard](https://dashboard.clerk.com/). Enable your preferred sign-in methods; email is enough for this MVP.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the application's `pk_test_…` value.
3. Copy `.dev.vars.example` to `.dev.vars`. Set `CLERK_SECRET_KEY` to the matching `sk_test_…` value. Leave `APP_ORIGIN=http://localhost:3000`.
4. Restart `pnpm dev` and open that exact origin. Using `127.0.0.1` or a different port requires changing `APP_ORIGIN` too.
5. Sign in. Save a memory, create a token, and try a read with it. Use a second account to verify independent libraries.

`.env.local` is used to inline the public browser key. `.dev.vars` supplies Worker secrets. Neither is committed. The app uses `@clerk/react` in the browser and `@clerk/backend` to verify session JWTs, avoiding reliance on Next.js-specific Clerk middleware.

Clerk production instance, custom-domain/DNS setup, sign-in redirects, and real account behavior must be verified before production deployment. Disabling a Clerk account does not automatically revoke this application's independent personal tokens; use the token revocation controls before offboarding. Automatic offboarding/webhooks are not part of this MVP.

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

The embedding model is `@cf/baai/bge-m3`, with a validated 1024-dimensional output. Changing model/dimensions requires a new index and full reindex, not mixing old and new vectors. Both AI and Vectorize need account access and may incur usage charges. Local testing of these remote services also uses your account; they are deliberately absent from the initial no-credential configuration.

Vectorize requires `remote: true` for local development; it has no local simulation. Keep D1 local while testing with a dedicated development Vectorize index. Local Cron Triggers do not run automatically. After saving or editing a test memory, invoke the local scheduled handler explicitly:

```sh
curl --fail http://localhost:3000/cdn-cgi/local/scheduled
```

Check the Usage page for pending jobs. Vector visibility is eventually consistent even after the queue drains. This local-only development endpoint is provided by Cloudflare tooling, not by the application's public API. See [Cloudflare binding support](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).

Set `vars.APP_ORIGIN` to the exact HTTPS application origin. Choose the final Worker/custom domain first, and configure the matching Clerk production instance. Use development resources for staging; do not reuse production D1/Vectorize between environments.

## 4. Configure production secrets and deploy

This step changes remote resources. Run it only when ready to deploy the chosen environment.

```sh
pnpm exec wrangler secret put CLERK_SECRET_KEY
# Run checks before deploying.
pnpm check
# Use the production Clerk publishable key in .env.local or the build environment.
pnpm build
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…` in the build environment or the ignored local env file **before building**. Never put `CLERK_SECRET_KEY` in a `NEXT_PUBLIC_*` variable. Runtime secret values are entered through Wrangler, not committed in `wrangler.jsonc`.

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

1. Enter an OpenAI-compatible base URL, a model, and an API key. DeepSeek's own
   endpoint is `https://api.deepseek.com` with a tool-capable model. Include the
   version path a provider documents, such as `https://openrouter.ai/api/v1`.
2. Press **Test connection**. The probe reports whether the endpoint answered
   *and* whether it called the probe tool. Most configuration mistakes are
   models that answer in prose but cannot call tools, and the agent acts only
   through tools.
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

### ChatGPT

ChatGPT signs the user in through the authorization server; this application publishes only the resource half of the MCP authorization contract. Clerk is the authorization server. OpenAI accepts any of CIMD, dynamic client registration, or a predefined client, so CIMD is a convenience rather than a requirement.

`pnpm oauth:check` fetches the instance metadata and lists what is still missing. Run it after each change below.

1. Open **OAuth applications → Settings**. Under **Client onboarding**, enable **Publish DCR support**. DCR is the self-serve path and the one this project assumes; **Publish CIMD support** is a tidier alternative only when Clerk has enabled it for your account, since CIMD is in beta and gated behind support. Leave CIMD off if it is unavailable: ChatGPT then registers one client per MCP connection through DCR and reuses it, so expect one extra row per connection on the **Applications** tab.
2. Set **Default scopes for dynamic clients** to `openid profile email offline_access memory:read memory:write`. ChatGPT may omit the `scope` parameter, so these defaults decide what a new link can do. Leave `memory:delete` out until you want a host to be able to forget memories.
3. On the **Scopes** tab, create the custom scopes `memory:read`, `memory:write`, and `memory:delete`, and advertise them.
4. Keep the OAuth consent screen enabled; Clerk enforces it automatically once DCR is published, and PKCE is required by default.
5. Under **Access token format**, prefer **opaque access tokens**: personal tokens are revocable immediately, and opaque OAuth tokens behave the same way. JWT access tokens stay valid until they expire (up to one day).
6. Confirm the result:

```sh
pnpm oauth:check
```

It must report a client registration method, `PKCE methods: S256`, and the memory scopes. `CLERK_ISSUER` is optional: the publishable key already encodes the frontend API host and `/.well-known/oauth-protected-resource` decodes it. Set the variable only when the issuer must not follow that key.

#### When neither CIMD nor DCR can be enabled

- **Predefined OAuth client.** Create an OAuth application, mark it **Public**, require PKCE, assign the memory scopes, and allowlist the redirect URI. This instance advertises RFC 9207 issuer identification, so ChatGPT uses the stable callback `https://chatgpt.com/connector_platform_oauth_redirect` instead of a per-connection URL. Enter that client ID in the connector dialog if it offers one; Codex accepts it explicitly with `codex mcp add shared_memory --url https://YOUR_ORIGIN/mcp --oauth-client-id YOUR_CLIENT_ID`.
- **Another authorization server.** `/.well-known/oauth-protected-resource` publishes whatever `CLERK_ISSUER` names, so a provider that supports CIMD (Auth0, Stytch, WorkOS) can be named instead. Its user IDs then have to be mapped onto Clerk accounts before this application serves the right library, which is why this is a fallback rather than the default.
- **An authorization-server shim in this Worker.** The Worker could publish its own authorization-server metadata and proxy `/oauth/authorize`, `/oauth/token`, and `/oauth/register` to Clerk. That needs a client registry, authorization-code storage, and token signing; it is deliberately not implemented.

Then connect:

1. In ChatGPT, open **Settings → Security and login** and turn on **Developer mode**.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button, and enter `https://YOUR_ORIGIN/mcp`.
3. ChatGPT reads the protected-resource metadata and opens the Clerk consent screen. Approve the scopes. Nothing is copied by hand.
4. Confirm the tools appear, then ask ChatGPT to search a memory you saved on this site. The Usage tab attributes those calls to a connected app.

If no consent screen appears, check that `curl -s https://YOUR_ORIGIN/.well-known/oauth-protected-resource` returns JSON, that the 401 from `/mcp` carries a `resource_metadata` challenge, and that Clerk lists the connection under **OAuth applications → Applications**.

If the callback comes back with `error=invalid_scope` and a description like *The OAuth 2.0 Client is not allowed to request scope 'openid'*, the dynamic client is missing a scope ChatGPT asks for on its own. ChatGPT requests every OIDC scope the authorization server advertises, and Clerk advertises `openid`, `profile`, `email`, and `offline_access`, so those must be in the client's allowed scopes even though this server never asks for them. Fix it in this order:

1. **OAuth applications → Settings → Client onboarding → Default scopes for dynamic clients**: include `openid profile email offline_access` alongside `memory:read memory:write`.
2. **Re-register the existing client.** Changing the defaults does not widen a client that already exists. Under **OAuth applications → Applications**, either edit that client's scopes to add the OIDC scopes, or delete it, then reconnect in ChatGPT so a fresh client is registered. `npx clerk@latest api oauth_applications` lists each application with the scopes it may request.
3. Re-run `pnpm oauth:check`, which prints the advertised OIDC scopes and the same warning.

ChatGPT currently announces MCP revision `2026-07-28` and opens with `server/discover`, a method that revision makes mandatory. The pinned MCP SDK implements revisions up to `2025-11-25`, so `lib/server/mcp.ts` accepts an unknown `MCP-Protocol-Version` by serving the request with the revision this server implements rather than answering `400`, and `server/discover` is answered with `Method not found` so the client falls back to `initialize` (which negotiates down to `2025-11-25`). That compatibility shim keeps 2025-era clients working; adopting `@modelcontextprotocol/server` 2.x is the durable fix if a client ever requires the newer revision outright.

Two Clerk behaviours are worth knowing. Its metadata advertises RFC 9207 issuer identification, which is what lets ChatGPT reuse the stable `https://chatgpt.com/connector_platform_oauth_redirect` callback; if an instance ever stops advertising it, ChatGPT falls back to a connection-specific redirect URI and registers a separate OAuth client per connection, and nothing here needs to change. Clerk also does not bind tokens to an audience, so this server verifies issuer, expiry, and scope, but not the `resource` parameter.

### Codex

Set `MEMORY_API_TOKEN` in the environment available to the Codex process, then add:

```toml
[mcp_servers.shared_memory]
url = "https://YOUR_ORIGIN/mcp"
bearer_token_env_var = "MEMORY_API_TOKEN"
```

Alternatively: `codex mcp add shared_memory --url https://YOUR_ORIGIN/mcp --bearer-token-env-var MEMORY_API_TOKEN`.

Copy `skills/shared-memory` into the client's discoverable skills directory (for example `~/.agents/skills/shared-memory` for Codex). Installing a skill does not override host approval settings or guarantee every conversation will use it.

### Cursor

Configure a remote server in the supported global or project `mcp.json`:

```json
{
  "mcpServers": {
    "shared_memory": {
      "url": "https://YOUR_ORIGIN/mcp",
      "headers": { "Authorization": "Bearer ${env:MEMORY_API_TOKEN}" }
    }
  }
}
```

Make the environment variable available to Cursor and install the same skill in its supported skills directory. Never commit a literal token in project configuration. GUI applications may not inherit your shell's environment; validate that in the actual client.

### DeepSeek

Use an MCP-capable agent host, or the Python tool-loop example in `examples/deepseek.py`. The model API does not execute memory tools itself. The example requires an independently supplied DeepSeek API key and has a bounded tool loop.

## 7. Package the plugin

The skill and the MCP server ship as one installable plugin. The generator reads the MCP URL from `wrangler.jsonc`, so the package cannot drift from the deployed origin:

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
- **What never leaves the deployment**: memory titles and content, search queries, request bodies, `Authorization`/`Cookie` headers, IP addresses and email addresses, and genAI inputs or outputs. The SDK runs with `sendDefaultPii: false`, and `lib/server/observability.ts` additionally strips those fields before sending. Error reports identify the account only by its opaque Clerk id.
- **Project settings**: enable **Prevent Storing of IP Addresses** and leave request-body storage off as defence in depth.
- **Source maps**: with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` present at build time, `vite build` uploads source maps and deletes the client copies afterwards. Set `SENTRY_RELEASE` (CI uses the commit SHA) so the Worker and the uploaded artifacts agree; otherwise stack traces stay minified. `wrangler.jsonc` also enables Cloudflare's own `upload_source_maps`, which keeps stack traces readable in the Cloudflare dashboard.

## 9. Deployment acceptance

The automated `pnpm test:e2e` suite covers the unsigned preview and rejected unauthenticated requests. Build it with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='' pnpm build` first. It runs the built Worker on port 3100 using `tests/e2e/wrangler.json`, which has only local bindings and no Cron, AI, Vectorize, or Clerk secrets. GitHub Actions builds this preview explicitly; the deployment step rebuilds separately with the production publishable key. These tests do not need a Cloudflare API token.

- Sign in/out with real Clerk sessions; verify invalid/expired sessions and unapproved origins are rejected.
- Two users cannot read, search, edit, delete, or inspect each other's history. A project-restricted token cannot read other projects, including `global`.
- Codex and Cursor initialize, list tools and perform real tool calls. Validate their actual supported protocol revisions against the pinned MCP SDK.
- Save a Chinese memory, wait for indexing, and retrieve it with an English/Chinese paraphrase. Score a small real-world retrieval set; local mock-vector tests cannot establish semantic quality.
- Edit during indexing and delete during embedding. Stale vectors must never return stale or deleted text.
- Verify Cron executes, provider failures retry, and revoked tokens stop working immediately.

Until these credentialed checks pass, local tests and builds do not establish deployment readiness.
