# Shared Memory

A private memory library shared across your AI agents. Built with vinext, Clerk, Cloudflare Workers/D1/Vectorize, Workers AI, and shadcn/ui.

English-first interface and documentation, with typed Simplified Chinese translations. Each user owns an isolated library. Codex and Cursor connect over remote MCP; DeepSeek can use an MCP-capable host or the HTTP tool adapter.

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

## Checks

```sh
pnpm check
pnpm build
pnpm test:e2e
```

The test suite executes the real migration against SQLite and tests authorization, optimistic concurrency, exact deduplication, forgetting, CJK keywords, vector hydration, provider failures, and MCP JSON-RPC. Playwright checks the unsigned interface and English/Chinese switching at desktop/mobile widths. These checks do not replace real Clerk authentication, remote D1/Vectorize, Cron, or client acceptance testing.

`pnpm lint` uses strict, type-aware antfu ESLint and allows no warnings. TypeScript strictness includes unchecked indexed access. Dependency versions are pinned by `pnpm-lock.yaml`.
