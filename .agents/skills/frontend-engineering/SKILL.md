---
name: frontend-engineering
description: Use when implementing or reviewing frontend architecture, component variants, data boundaries, localization, preferences or SSR hydration while preserving native framework and product contracts.
license: MIT
---

# Frontend engineering

Read AGENTS.md, the project design contract, scripts, compiler config and framework entry points. Use ui-foundation/ui-web for design and frontend-verification for execution evidence. Select Skills explicitly in zt.json; sync does not resolve their dependencies.

1. Map the feature from route/server boundary through validation, state owner and components. Follow [boundaries](references/boundaries.md) and [source structure](references/source-structure.md); keep business/deployment assumptions local.
2. Reuse semantic tokens, typography and component variants. Use configurable body/control/help size roles
   from the project design contract and `ui-foundation`, rather than shrinking whole forms or scattering literal sizes. Define missing semantic roles, including destructive actions, in the project contract without copying another product's values.
   Fonts must use Noto Sans or Noto Serif families, including appropriate CJK variants, and Noto Color
   Emoji for all emoji. Support at least English and Chinese/Japanese/Korean glyphs. Use Noto Sans for ordinary
   UI; choose Noto Serif only where the content benefits from serif typography. The Google Fonts
   API is the delivery route; document third-party browser requests, CSP and performance implications.
   Use Unicode-ranged subsets and the required weights; do not self-host or vendor font binaries.
   Preserve font licenses and verify actual rendered glyphs, weights and emoji sequences in the
   browser rather than relying on a CSS family name or platform
   fallback. Keep emoji consistently color; do not use a monochrome-first stack. Record this choice
   in the local design contract.
   Use Lucide components from the project's framework package for action, navigation and status
   icons, rather than Unicode or emoji glyph substitutes. Keep size, stroke and alignment consistent
   for each semantic role. Give icon-only controls an accessible name and mark decorative SVG icons
   `aria-hidden="true"`. Preserve genuine prose, mathematics, user content and intentional emoji;
   intentional emoji use Noto Color Emoji. Audit these distinctions during consumer source migrations.
3. Validate unknown runtime input using the existing schema mechanism. Preserve retry and input; do not expand a boundary improvement into an unrelated client/server rewrite.
4. Normalize supported preferences and render deterministic SSR defaults. Apply [preferences and localization](references/preferences-i18n.md) to hydration, persistence, errors and dialogs.
5. Preserve framework exports and native browser fallback. Run the compiler/build alongside strict ESLint; lint alone cannot validate routing or Worker deployment.
   Construct GitHub Actions with the [workflow contribution contract](references/github-actions.md).
   Keep the common Verify → Deploy order and project-owned extension points; retain required native
   checks, the failure-evidence probe and automatic main deployment within existing authorization.
6. Report changed decisions, affected states, exact checks and uncertainty. Visual baselines and performance budgets are deferred.

## Generic shared shell

The `@ztd-me/ui` source item provides reusable chrome, validated non-sensitive appearance/UI locale and explicit persistence mechanisms. Its defaults are Neutral + System and six palettes. Consumers supply their own brand, footer/repository/contact content, cookie name/domain/Secure choice, optional storage notification key and business slots. Tools must not select policy through project names or hostnames, enforce a repository-host allowlist, or carry legacy storage mappings. Remove rejected legacy mappings entirely rather than moving them into consumers; old business/auth storage stays untouched. Shared domain cookies are untrusted UI input. Consumers own development/preview isolation, deployment, authentication, account state and business navigation. Generic shell guidance grants no sync ownership over project components or production files. Preserve native strict gates and upstream licenses. The owner reviews and merges upstream changes. Final source integration requires a full approved source SHA and fresh public installation before consumer acceptance; local source/packed evidence or a local-font Cloud preview does not verify actual Google Fonts loading. Consumers own installed source and reviewed updates; no automatic overwrite or new synchronization service is provided.

For shared primitives, native scrolling, overlay semantics and explicit adapter injection, read
[shared primitive integration](references/shared-primitives.md). Do not construct a hidden
translation engine inside a component or library.

The upstream canonical source and private verification harness are in `tools/packages/ui`;
`@ztd-me/ui` is the source registry item, with no npm UI binary.
