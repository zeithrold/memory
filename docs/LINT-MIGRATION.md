# Strict lint migration

The application uses the public `@ztd-me/eslint@0.1.1` package with its async
default factory, typed TypeScript checks and `react: { framework: 'vinext' }`.
The package's intended JSX accessibility setting is unchanged. TypeScript keeps
`strict` and `noUncheckedIndexedAccess` enabled.

The peer versions are ESLint `^10.11.0`, TypeScript `~6.0.3`, and Node
`>=22.14.0`. The package manager is pinned to pnpm `11.22.0`. The only release-age
exception is `@ztd-me/eslint`; `trustPolicy: no-downgrade`, release-age exception
pruning, shell emulation and the existing `semver@6.3.1` trust exception remain.
pnpm's `allowBuilds` preserves the previous esbuild/workerd grants and explicitly
refuses the previously ignored Sentry CLI build script.

## Refactoring boundaries

- Server facades retain their public exports while catalog queries, run state,
  tool dispatch, provider adapters, memory storage and MCP transport are split
  into smaller modules.
- JSON responses and stored JSON are parsed at their boundaries. Tool schema
  generics carry validated inputs through dispatch without unsafe casts.
- UI models, loaders, forms and presentation components are separated. Session
  cookies, memory create idempotency keys and edit version checks are preserved.
  Catalog polling retains unsaved settings and runs only for active jobs.
- Workflow helpers retain durable step names, retry policy, provider timeouts,
  paid-call checkpoints, daily budget checks, failure recording and dry-run
  behavior. SQL transactions and optimistic concurrency remain covered by the
  integration suite.
- Constant SQL, prompt text, locale messages and error definitions were compared
  with the pre-migration checkout. All 127 static SQL statements, 24 system-prompt
  combinations, three batch-message cases, both locales and all 29 error
  definitions match. Public exports were checked across 52 server/route modules.

The existing CI checks run strict lint through `pnpm check`. Production deployment
is permitted only when `github.event_name == 'push'` and
`github.ref == 'refs/heads/main'`; branch pushes and pull requests skip that step.

## Upstream Vinext declaration issue

The installed public `vinext@1.0.0-beta.10` tarball declares its
`vinext/server/fetch-handler` entry by importing and re-exporting
`virtual:vinext-worker-entry`, but does not declare that virtual module. With
`skipLibCheck` enabled, the import becomes an error-typed value and strict lint
reports `ts/no-unsafe-assignment`. Disabling `skipLibCheck` exposes `TS2307` in
`dist/server/fetch-handler.d.ts` on both its import and re-export.

Minimal source:

```text
import handler from 'vinext/server/fetch-handler'

const checked: ExportedHandler = handler
void checked
```

Use the application's worker types and a tsconfig that includes this file but
does not include `vinext-worker-entry.d.ts`. Configure typed lint with:

```js
import config from '@ztd-me/eslint'

export default config({
  react: { framework: 'vinext' },
  typescript: { tsconfigPath: 'tsconfig.json' },
})
```

`pnpm exec eslint sample.ts` reports the unsafe assignment; `pnpm exec tsc
--noEmit --skipLibCheck false` reports the missing virtual module. This was
reproduced separately from the application with the same installed packages.

The application supplies a precise ambient declaration for the generated worker
entry in `vinext-worker-entry.d.ts`, and the worker assignment now checks against
`ExportedHandler<Env>`. Typed rules remain enabled. The upstream fix would be a
published declaration for that virtual entry. No external issue was filed.

## Validation

- Public package installation and frozen pnpm installation passed with the
  configured security policies.
- `pnpm check`: zero lint warnings, TypeScript passed, 257 unit/integration tests
  passed across 34 files, including new API response and Workflow regressions.
- `pnpm build` and `pnpm check:bundle`: production build passed; the bundle exports
  `CatalogWorkflow` with its scheduling configuration intact.
- `pnpm e2e:build` followed by Playwright using the environment's system Chromium:
  all 16 desktop/mobile checks passed. These cover navigation, language
  persistence, route chunks, dialogs, error documentation and unauthenticated API
  boundaries. Page-error collection and preview screenshots were checked.
- A configured local UI preview with mocked API responses passed eight additional
  interaction checks: create idempotency keys, edit version checks, detail reload,
  search filtering, active-run polling, preservation of unsaved settings during
  polling, settings save and manual run. All 30 requests hit expected mock routes
  and no page errors occurred. These checks validate the browser UI rather than
  a live authenticated session; server authorization is covered by integration
  tests.

The browser preview uses local bindings. No migration validation deploys the
application or calls a paid model provider.
