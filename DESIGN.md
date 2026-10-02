# Memory frontend contract

Extracted from main `143e1a71eda4bc1500c28dc65270d16c96378906`, `app/globals.css`,
`components/ui`, `components/workspace-shell.tsx`, and `lib/i18n`.
Shared guidance/checks use tools source
[`3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f`](https://github.com/zeithrold/tools/blob/3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f/docs/frontend-tooling.md).

## Product and visual identity

Memory is a private library of context shared across agents. Preserve memory creation,
editing, search, catalog maintenance and connection instructions. The green palette,
quiet surfaces, existing typography and compact controls remain local product choices.
Empty, loading, setup and service recovery states are real states, not sample content.

`app/globals.css` owns the light surface, foreground, muted text, primary action,
feedback, border, focus and layout tokens. Paint literals belong in custom properties;
Tailwind's imported declarations are included in the checker inventory. `--ink` aliases
the foreground role. Muted/navigation/search/tag foregrounds were darkened within
the existing green family in response to measured Axe contrast failures. `--color-destructive` owns destructive controls. No runtime token
exceptions are needed. Token inventory alone does not prove a rendered state's contrast.

Inter is a local/system preference, followed by system and CJK-capable sans-serif fonts;
there is no third-party font request. The spacing scale and panel padding retain their
existing values. The sidebar/content layout changes at 1000px; compact panels change at
640px. Retain the original reflow rules. Component variants remain in the existing CVA
and Radix primitives. Dialogs require a translated close label and retain focus trapping,
Escape dismissal and focus restoration. The first keyboard link skips repeated navigation.

## Preferences and boundaries

The shipped theme is light. The existing Tailwind dark variant is not evidence of a
supported dark theme; adding theme ownership is outside this change. Skeleton animation
honors reduced motion. Language values are `en` and `zh-CN`, normalized by the existing
cookie reader, with English as the deterministic SSR fallback. The workspace updates
`html.lang` and persists its existing one-year, SameSite=Lax locale cookie. Dictionaries
own user-facing errors, retry and dialog close copy.

The workspace API client validates responses with the existing Zod schemas. Mutations
retain idempotency keys and expected versions. The server still owns authentication,
tenancy, concurrency, storage and model execution. Browser fixtures intercept only local
API requests with synthetic data; they supply no Access session, token or paid provider.
The configured local preview's unmocked APIs must still reject anonymous requests.

## Tooling and evidence

Use pnpm 11.22.0, `@ztd-me/eslint@0.1.1`, `@ztd-me/frontend-checks@0.1.0`,
`@playwright/test@1.62.0`, matching `playwright-core@1.62.0`, and the exact tools CLI commit above. `zt.json` selects all five
Skills explicitly; `zt sync --root . --plan` previews changes and detects local edits.
Check in the managed Skills and `zt.lock.json`; do not hand-edit their contents.
The approved `@ztd-me/*` exception applies only to release age. Trust remains
`no-downgrade`, with only the existing exact `semver@6.3.1` exception and build grants.

`pnpm check` runs each native frontend gate once through zt: lint, CSS, types, unit,
unsigned build/bundle guard, unsigned browser suite, configured mock browser suite.
The second compilation enables session affordances in the UI without changing auth;
it restores the unsigned `dist` in `finally`. These suites share desktop/mobile projects
but have distinct routes/contracts and artifact subdirectories. No aggregate invokes itself.

zt retains command results and CSS JSON in a unique `.zt/artifacts` run directory.
`metadata.json` records the source revision, dirty state, tool/package versions and
lockfile hashes; CI also records the pull request head independently of its merge checkout.
Playwright retains full Axe scans, named captures, HTML/JSON reports, and failure
screenshots/traces/videos there. `pnpm test:artifacts` deliberately fails one isolated
unlabelled button scan, then verifies the failure and complete evidence; this is separate
from passing application tests. CI uploads `.zt/artifacts` on success or failure.

Axe uses the helper's full-page WCAG 2 A/AA, 2.1 AA and 2.2 AA defaults. Keyboard tests
cover skip navigation, dialog Tab/Shift+Tab trapping, dismissal and restored focus.
Automated captures are review evidence, not visual approval. Baselines and performance
budgets are deferred. Real Access/OAuth, remote bindings, live models and deployment
remain outside these local/mock checks. Deployment retains its main-push-only condition.
