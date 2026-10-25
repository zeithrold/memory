# Shared Memory

A private memory library shared across your AI agents. Built with vinext, Cloudflare Access, Cloudflare Workers/D1/Vectorize, Workers AI, and shadcn/ui.

English-first interface and documentation, with typed Simplified Chinese translations. Each user owns an isolated library. ChatGPT, Codex, Cursor, and other MCP hosts link through Cloudflare Access Managed OAuth; personal `mem_*` tokens remain for local development and direct REST. The skill and the MCP server ship together as one installable plugin.

## Local development

Requires Node.js 24 and pnpm 11.22.0.

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

Install the pinned CLI (requires Go >=1.24) and Chromium once, then run the aggregate:

```sh
go install github.com/zeithrold/tools/cmd/zt@7fd78ba96830452502adbda07575bb250af914ba
pnpm exec playwright install chromium
pnpm check
pnpm test:artifacts
```

Ensure Go's bin directory is on `PATH`. `pnpm check` runs strict lint, CSS/token
validation, types, unit/integration tests, the unsigned build and bundle guard, and
separate desktop/mobile unsigned and mocked-session browser suites, each once.
`pnpm check:code` is the narrower lint/types/unit loop; `pnpm test:e2e` prepares both
browser variants when run separately. Builds clear Access/Sentry credentials; mocked
session affordances use a synthetic public domain and intercepted APIs, not real auth.
See [the frontend contract](DESIGN.md) for state coverage and artifact boundaries.

The five generic development Skills (`js-ts-testing`, `ui-foundation`, `ui-web`,
`frontend-engineering`, `frontend-verification`) are installed once for the current user in
`~/.agents/skills` from Tools
[`7fd78ba96830452502adbda07575bb250af914ba`](https://github.com/zeithrold/tools/tree/7fd78ba96830452502adbda07575bb250af914ba/skills);
this repository keeps no copy, and `zt.json` selects modules and native commands only.
Selection lives in the user-global `~/.agents/zt.json` or an explicit `zt sync --skills` list
served by the new global `zt sync` in the Tools source working tree, which is not released yet;
the `zt` pin above keeps running native checks and has no global flags.
`zt.lock.json` stays as an empty retired lock because the verification metadata `pnpm check` writes hashes it.
The product's `skills/shared-memory` Skill has separate ownership and is outside any sync.
Read [DESIGN.md](DESIGN.md) and `ui-foundation`'s global
[visual review workflow](https://github.com/zeithrold/tools/blob/7fd78ba96830452502adbda07575bb250af914ba/skills/ui-foundation/references/visual-design.md) for UI work.
CI's check runner stays pinned to `3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f`; it does not sync Skills.
CI retains zt reports, CSS findings, full Axe scans and browser captures in
`.zt/artifacts`, including failure traces/screenshots/videos. `pnpm test:artifacts`
verifies these files using one deliberate Axe failure in an isolated consumer probe.

`pnpm check:bundle` asserts against the built artifact that every Workflow class the Wrangler configuration binds is still a named export of the entry module. `pnpm deploy` runs it between the build and the upload, because a Workflow that lost its export would deploy without error and then never run.

The test suite executes the real migrations against SQLite and tests authorization, Access JWT verification and challenges, optimistic concurrency, exact deduplication, forgetting, CJK keywords, vector hydration, provider failures, MCP JSON-RPC, plugin packaging, credential sealing, the catalog policy gateway, the tool loop's idempotency and dry-run behaviour, run reversion and proposal decisions. Playwright checks the unsigned interface, the memory detail route, discovery failing closed, and English/Chinese switching at desktop/mobile widths. These checks do not replace real Cloudflare Access authentication or Managed OAuth linking, remote D1/Vectorize, a scheduled Workflow firing, a live model endpoint, or client acceptance testing.

`pnpm lint` uses `@ztd-me/eslint@0.1.2` strict, type-aware ESLint and allows no warnings. TypeScript strictness includes unchecked indexed access. Dependency versions are pinned by `pnpm-lock.yaml`.
