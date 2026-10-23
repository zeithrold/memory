---
name: frontend-verification
description: Use when establishing or running frontend lint, CSS, types, unit, build, browser accessibility and artifact gates with exact execution evidence and explicit blocked checks.
license: MIT
---

# Frontend verification

Read js-ts-testing, the design contract and native scripts. Select ui-foundation/ui-web for UI work and frontend-engineering for architecture, preferences and data boundaries. Skill guidance does not itself run checks.

1. Inspect modules/script contents using zt inspect/plan. Confirm pnpm and browser/Worker preconditions; keep discovery read-only.
2. Define an ordered explicit profile in zt.json. Follow [gate integration](references/gates.md). Required absent/failed checks must fail; do not relabel them as warnings to obtain a pass.
3. Run strict JS/TS lint, CSS validation, compiler, focused unit/integration tests and the native build. Preserve @ztd-me/eslint limits independently of existing project violations.
4. Run browser interactions/Axe against the intended built runtime. Follow [evidence](references/evidence.md). Distinguish real services, mocked APIs and native fallback coverage.
5. Retain reports, CSS findings, failure logs, traces and named captures under the artifact root. Upload on CI success/failure; unretained /tmp captures do not fulfill this contract.
6. Report revision, tool/package versions, commands, scope, results, artifact paths and blocked/manual work. Visual baseline management remains deferred. Apply explicitly approved fixture budgets; consumer performance budgets remain consumer-owned.

Verify action/navigation/status icons use Lucide components rather than Unicode/emoji substitutes.
Check accessible names on icon-only controls, `aria-hidden="true"` on decorative SVGs, and consistent
size/stroke/alignment by role. Preserve prose, mathematics, user content and intentional Noto Color
Emoji; keep composed emoji specimens in the rendering gate. Include this audit in consumer migrations.

The shared UI harness has owner-approved combined font/API CSS response budgets: English cold
500,000 bytes, Chinese cold 1,000,000 bytes, and each immediate warm reload 10,000 bytes. Cold scenarios
use separate fresh browser contexts; warm reloads use the same context with default caching. Report
font/CSS and encoded/decoded sizes separately. The multilingual/emoji specimen retains rendering,
weight, sequence, CSP and request-count checks plus transfer reporting without an ordinary-page byte
cap. Local-font preview cannot verify remote budgets; actual Google API CI and public installation must.

## Generic shared shell

The `@ztd-me/ui` source item provides reusable chrome, validated non-sensitive appearance/UI locale and explicit persistence mechanisms. Its defaults are Neutral + System and six palettes. Consumers supply their own brand, footer/repository/contact content, cookie name/domain/Secure choice, optional storage notification key and business slots. Tools must not select policy through project names or hostnames, enforce a repository-host allowlist, or carry legacy storage mappings. Remove rejected legacy mappings entirely rather than moving them into consumers; old business/auth storage stays untouched. Shared domain cookies are untrusted UI input. Consumers own development/preview isolation, deployment, authentication, account state and business navigation. Generic shell guidance grants no sync ownership over project components or production files. Preserve native strict gates and upstream licenses. The owner reviews and merges upstream changes. Final source integration requires a full approved source SHA and fresh public installation before consumer acceptance; local source/packed evidence or a local-font Cloud preview does not verify actual Google Fonts loading. Consumers own installed source and reviewed updates; no automatic overwrite or new synchronization service is provided.

The upstream canonical source and private verification harness are in `tools/packages/ui`;
`@ztd-me/ui` is the source registry item, with no npm UI binary.
