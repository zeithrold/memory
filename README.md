# Shared Memory

A private memory library shared across your AI agents. Built with vinext, Cloudflare Access, Cloudflare Workers/D1/Vectorize, Workers AI, and shadcn/ui.

English-first interface and documentation, with typed Simplified Chinese translations. Each user owns an isolated library. ChatGPT, Codex, Cursor, and other MCP hosts link through Cloudflare Access Managed OAuth; personal `mem_*` tokens remain for local development and direct REST. The skill and the MCP server ship together as one installable plugin.

## Local development

Requires Node.js 24 and pnpm 10.33.0.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:3000. Without credentials, the interface displays setup instructions; private endpoints remain protected.

- [Setup, credentials, and deployment](docs/SETUP.md)
- [Architecture and MVP limits](docs/ARCHITECTURE.md)
- [Catalog: the scheduled taxonomy agent](docs/CATALOG.md)
- [HTTP and MCP contracts](docs/API.md)
- [Shared Memory skill](skills/shared-memory/SKILL.md)

A running instance documents every machine error at `/errors`, one page per code, and returns them as RFC 9457 problem documents whose `type` points at that page. Error monitoring is optional and off without `SENTRY_DSN`; when enabled, local runs report as `stage` and deployments as `production`.

## Plugin package

`pnpm plugin:build` assembles the skill and the MCP server into one installable plugin under `dist/plugin`, with the MCP URL read from `wrangler.jsonc`. `pnpm oauth:check` reports whether the configured Cloudflare Access team advertises Managed OAuth (DCR, PKCE S256, RFC 8707). See [connect clients](docs/SETUP.md) for Access OAuth setup and local marketplace installation.

For non-plugin hosts, install the portable Agent Skill globally into every compatible local agent detected by the Skills CLI:

```sh
npx skills add zeithrold/memory --skill shared-memory -g
```

The skill supplies the retrieval and bounded automatic-capture policy. Its `scripts/configure.mjs` helper securely prompts for endpoint plus token and validates them through `/api/v1/status`; run it from the installed Skill directory. The helper does not edit a host's MCP configuration, so connect the remote server separately in hosts that do not install the combined plugin.

## Checks

```sh
pnpm check
pnpm build
pnpm check:bundle
pnpm test:e2e
```

`pnpm test:e2e` runs `pnpm e2e:build` first, which rebuilds the preview with no Access or Sentry credentials, so the browser checks never depend on your local `.env.local` or a real identity provider.

`pnpm check:bundle` asserts against the built artifact that every Workflow class the Wrangler configuration binds is still a named export of the entry module. `pnpm deploy` runs it between the build and the upload, because a Workflow that lost its export would deploy without error and then never run.

The test suite executes the real migrations against SQLite and tests authorization, Access JWT verification and challenges, optimistic concurrency, exact deduplication, forgetting, CJK keywords, vector hydration, provider failures, MCP JSON-RPC, plugin packaging, credential sealing, the catalog policy gateway, the tool loop's idempotency and dry-run behaviour, run reversion and proposal decisions. Playwright checks the unsigned interface, the memory detail route, discovery failing closed, and English/Chinese switching at desktop/mobile widths. These checks do not replace real Cloudflare Access authentication or Managed OAuth linking, remote D1/Vectorize, a scheduled Workflow firing, a live model endpoint, or client acceptance testing.

`pnpm lint` uses strict, type-aware antfu ESLint and allows no warnings. TypeScript strictness includes unchecked indexed access. Dependency versions are pinned by `pnpm-lock.yaml`.
