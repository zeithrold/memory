# Shared Memory

A private memory library shared across your AI agents. Built with vinext, Clerk, Cloudflare Workers/D1/Vectorize, Workers AI, and shadcn/ui.

English-first interface and documentation, with typed Simplified Chinese translations. Each user owns an isolated library. ChatGPT links over OAuth and Codex, Cursor, or any MCP host connects with a personal token; the skill and the MCP server ship together as one installable plugin.

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
- [HTTP and MCP contracts](docs/API.md)
- [Shared Memory skill](skills/shared-memory/SKILL.md)

A running instance documents every machine error at `/errors`, one page per code, and returns them as RFC 9457 problem documents whose `type` points at that page. Error monitoring is optional and off without `SENTRY_DSN`; when enabled, local runs report as `stage` and deployments as `production`.

## Plugin package

`pnpm plugin:build` assembles the skill and the MCP server into one installable plugin under `dist/plugin`, with the MCP URL read from `wrangler.jsonc`. `pnpm oauth:check` reports whether the configured Clerk instance can register an MCP client (CIMD, DCR, or a predefined client) and whether the memory scopes are advertised. See [connect clients](docs/SETUP.md) for the ChatGPT OAuth setup and local marketplace installation.

## Checks

```sh
pnpm check
pnpm build
pnpm test:e2e
```

The test suite executes the real migrations against SQLite and tests authorization, OAuth scope mapping and challenges, optimistic concurrency, exact deduplication, forgetting, CJK keywords, vector hydration, provider failures, MCP JSON-RPC, and plugin packaging. Playwright checks the unsigned interface, discovery failing closed, and English/Chinese switching at desktop/mobile widths. These checks do not replace real Clerk authentication or OAuth linking, remote D1/Vectorize, Cron, or client acceptance testing.

`pnpm lint` uses strict, type-aware antfu ESLint and allows no warnings. TypeScript strictness includes unchecked indexed access. Dependency versions are pinned by `pnpm-lock.yaml`.
