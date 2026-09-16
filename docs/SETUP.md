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

## 5. Connect clients

Create a separate token for each client, normally with `memory:read` and `memory:write`. Add `memory:delete` only if the client should fulfill explicit forgetting requests. Tokens expire after 90 days by default and can be restricted to one project.

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

## 6. Deployment acceptance

- Sign in/out with real Clerk sessions; verify invalid/expired sessions and unapproved origins are rejected.
- Two users cannot read, search, edit, delete, or inspect each other's history. A project-restricted token cannot read other projects, including `global`.
- Codex and Cursor initialize, list tools and perform real tool calls. Validate their actual supported protocol revisions against the pinned MCP SDK.
- Save a Chinese memory, wait for indexing, and retrieve it with an English/Chinese paraphrase. Score a small real-world retrieval set; local mock-vector tests cannot establish semantic quality.
- Edit during indexing and delete during embedding. Stale vectors must never return stale or deleted text.
- Verify Cron executes, provider failures retry, and revoked tokens stop working immediately.

Until these credentialed checks pass, local tests and builds do not establish deployment readiness.
