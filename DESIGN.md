# Memory frontend contract

Memory is a private context library for AI agents. Preserve creation/edit/search,
catalog maintenance, connection instructions, authentication and all real empty,
loading, setup, service failure and recovery states.

The editable `@ztd-me/ui` source is pinned to tools
`7c708c0e0672a302cd751550276fb7a7a43cf1e5` and installed through `shadcn@4.21.1`.
See [ownership, reproducibility and acceptance](docs/UNIFIED-FRONTEND-MIGRATION.md)
and `ui-source.lock.json`. Installed source is consumer-owned; updates require a
reviewed merge, not automatic overwrite. Keep MIT/shadcn/Noto notices.

Neutral/System is the default, with six palettes and light/dark/system modes.
Appearance and non-sensitive UI locale use the existing explicit current-format
production cookie policy; preview/development remain isolated. Neither source nor
consumer reads/maps/deletes retired preferences. Auth, accounts, business state and
drafts stay local. API mutations retain idempotency keys and expected versions.

The shell uses soft semantic borders, compact visible control surfaces with 44px
hit targets and menu enter/exit motion. Closed menus stop intercepting pointers;
reduced motion disables their animations. Preserve Memory's business navigation,
content widths, panel spacing, responsive rules, native link prefetch policy and
translated dialogs/focus. Footer identity remains © Zeithrold, this repository and
`hello@ztd.me`, without a year or extra navigation. One provider and one main landmark
own each shell; server and first client share one initial snapshot.

Ordinary UI uses Noto Sans with SC/JP/KR language-specific variants and Noto Color
Emoji for genuine emoji, delivered directly by the Google Fonts API. Do not add
unused Serif families, font binaries or Fontsource. Disable synthesized weights.
Use Lucide SVGs for actions/navigation/status with consistent role sizes, decorative
`aria-hidden` and named icon-only controls; preserve prose, mathematics and user content.
Third-party network/privacy/mutability/CSP boundaries are documented in the migration.

The workspace uses left-aligned navigation with an explicit active underline, a compact task heading and a bounded search surface. Setup, empty and populated states use real product information; the empty library illustration carries no fictitious records. Empty initial results omit unavailable pagination while preserving navigation from later pages. Main content and navigation share one alignment grid. Catalog empty states use a bounded 224/192px minimum region with control-sized explanatory text. Normal resource notices use the semantic border and a polite status role; exceeded budgets retain the destructive alert treatment. Alert titles wrap so translated status text remains available. Category members use a ruled list with titles above wrapping metadata, including inside child dialogs. Child dialogs reserve room for the close control; their openers remain focusable while a guarded request is busy, so dismissal restores the actual opener.

Body/control/help roles are 15/13/12px; editable fields stay 16px. Page titles cap at 32px on wide layouts and 26px on narrow layouts, with 18px empty-state headings. Type size changes preserve 44px controls, wrapping translations and 200% text reflow. Public and workspace routes share one consumer-owned brand treatment. At 360px and below, the signed-in appbar tightens spacing to keep the brand on one line while retaining 44px touch targets for appearance, language and account controls. Keep review captures in ignored artifacts and distinguish synthetic-session coverage from actual authentication or live service evidence.

Paint literals belong in semantic token declarations. App roles reference installed
shared tokens. Static CSS checking includes all installed styles, Tailwind declarations
and only the exact Radix runtime custom properties. Verify actual palette contrast,
keyboard focus, inert cleanup, motion and narrow reflow; token inventory is insufficient.

Use pnpm 11.22.0, `@ztd-me/eslint@0.1.5`, `@ztd-me/frontend-checks@0.1.3` and matching
Playwright 1.62.0. The managed development Skills are pinned to Tools
`7fd78ba96830452502adbda07575bb250af914ba` in `zt.lock.json`; CI's check runner remains at
`3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f`. These pins are separate from the installed UI source.
Use the installed [eight-dimension visual review](.agents/skills/ui-foundation/references/visual-design.md)
with this contract's local role budgets and real workspace states. Preserve release-age gates, no-downgrade trust,
the exact semver@6.3.1 exception and existing build grants. The Radix Select patch is
declaration-only. Strict UI library checking is required alongside application types.

Native gates remain lint, CSS, types, units, unsigned production Worker/bundle build,
unsigned browser suite and configured synthetic-session browser suite. Tests exercise
SSR without JavaScript, hydration, storage boundaries, preferences, all palettes/modes/
locales, keyboard/dialogs, full-page Axe, application CRUD/recovery and catalog polling.
Actual remote Noto glyphs/weights/complete emoji and English/Chinese cold/warm transfer
caps are required in CI. Cloud-only local font preview cannot establish remote acceptance.

Retain transient JSON, captures, traces, videos and CSS/check reports only under ignored
`.zt/artifacts` and CI artifacts. Durable docs and source provenance remain committed.
A deliberate expected-failure probe verifies evidence retention. Visual captures support
owner review, not automatic visual approval. Authenticated production CSP, real Access,
remote models/bindings and deployment are not established by local synthetic checks.
Production deployment follows the existing main-push workflow after green checks.
Manual deployments retain the project's release authorization boundary.

Missing routes retain the shared shell, localized recovery copy and reachable return links. Protocol error definitions remain product-owned and unchanged.

Token names and project identifiers wrap within their row at narrow widths. Copy actions share one component: missing or denied clipboard access gives localized manual-copy guidance, and a replaced secret resets the success label.
