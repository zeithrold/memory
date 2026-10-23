---
name: ui-foundation
description: Apply cross-frontend principles for information hierarchy, accessible interaction, responsive content, and visual evidence.
license: MIT
---

# UI foundation

Read the project's own design contract and component guidance first. Use its brand, tokens, product content, and component foundation.

Typography uses Noto Sans or Noto Serif families with appropriate CJK variants, plus Noto Color Emoji
for all emoji. Provide English and Chinese/Japanese/Korean glyph coverage through the Google Fonts API; do not
self-host or vendor font binaries. Retain licenses, document third-party requests/CSP/privacy and load
only required subsets and weights. Prefer Noto Sans for UI and Noto Serif for content that benefits
from it, without loading both by default. Verify rendered
glyphs and multi-codepoint emoji with the intended Noto fonts. Keep emoji consistently color rather
than using a monochrome-first stack, and record this choice in the local design contract.

Use Lucide components for action, navigation and status iconography. Unicode arrows, symbols and
emoji are not substitutes for interface icons. Use consistent size, stroke and alignment for each
role; give icon-only controls an accessible name and hide decorative SVGs from assistive technology
with `aria-hidden="true"`. Preserve genuine prose, mathematics, user content and intentional emoji;
intentional emoji use Noto Color Emoji. Check consumer-owned icons during source migrations without
moving product navigation or content into tools runtime.

For each changed flow, review the user's goal, primary and secondary actions, information that must remain visible, and the recovery path. Inspect loading, empty, populated, error, disabled, and success states. Check labels, focus order, keyboard use, accessible names, and error association. At narrow viewports, large text, long translations, and reduced motion, preserve important content and reachable actions.

Use the project's stack-specific UI skill for implementation details. Record what was observed in real runtime or device captures, what automated checks established, and what still needs human visual judgment. A design document, build, or screenshot alone does not prove the interface works.

For visual refinement or award/reference comparisons, use [visual design review](references/visual-design.md).
Keep role budgets and the visual concept consumer-owned; inspect rendered typography and interaction states before claiming completion.

See [review matrix](references/review-matrix.md) for a concise state and environment inventory. Keep colors, typography, spacing values, and business-specific component patterns in the project design contract.

Use [design contract extraction](references/design-contract.md) when consolidating principles from existing projects. Trace semantic token roles, component variants, local typography and preferences to source evidence; preserve project-specific values and business choices.

## Generic shared shell

The `@ztd-me/ui` source item provides reusable chrome, validated non-sensitive appearance/UI locale and explicit persistence mechanisms. Its defaults are Neutral + System and six palettes. Consumers supply their own brand, footer/repository/contact content, cookie name/domain/Secure choice, optional storage notification key and business slots. Tools must not select policy through project names or hostnames, enforce a repository-host allowlist, or carry legacy storage mappings. Remove rejected legacy mappings entirely rather than moving them into consumers; old business/auth storage stays untouched. Shared domain cookies are untrusted UI input. Consumers own development/preview isolation, deployment, authentication, account state and business navigation. Generic shell guidance grants no sync ownership over project components or production files. Preserve native strict gates and upstream licenses. The owner reviews and merges upstream changes. Final source integration requires a full approved source SHA and fresh public installation before consumer acceptance; local source/packed evidence or a local-font Cloud preview does not verify actual Google Fonts loading. Consumers own installed source and reviewed updates; no automatic overwrite or new synchronization service is provided.
