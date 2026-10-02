---
name: frontend-verification
description: Use when establishing or running frontend lint, CSS, types, unit, build, browser accessibility and artifact gates with exact execution evidence and explicit blocked checks.
---

# Frontend verification

Read js-ts-testing, the design contract and native scripts. Select ui-foundation/ui-web for UI work and frontend-engineering for architecture, preferences and data boundaries. Skill guidance does not itself run checks.

1. Inspect modules/script contents using zt inspect/plan. Confirm pnpm and browser/Worker preconditions; keep discovery read-only.
2. Define an ordered explicit profile in zt.json. Follow [gate integration](references/gates.md). Required absent/failed checks must fail; do not relabel them as warnings to obtain a pass.
3. Run strict JS/TS lint, CSS validation, compiler, focused unit/integration tests and the native build. Preserve @ztd-me/eslint limits independently of existing project violations.
4. Run browser interactions/Axe against the intended built runtime. Follow [evidence](references/evidence.md). Distinguish real services, mocked APIs and native fallback coverage.
5. Retain reports, CSS findings, failure logs, traces and named captures under the artifact root. Upload on CI success/failure; unretained /tmp captures do not fulfill this contract.
6. Report revision, tool/package versions, commands, scope, results, artifact paths and blocked/manual work. Visual baseline management and performance budgets are deferred.
