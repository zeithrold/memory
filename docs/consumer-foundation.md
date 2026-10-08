# Consumer Tailwind and translation foundation

`app/globals.css` imports Tailwind and the Tools `tailwind.css` entry, and explicitly
includes the delivered shared-source directory in utility discovery. Product layout
and responsive rules live in component utilities. The thin application stylesheet
retains product-specific headings, catalog children and skeleton animation; shared
tokens, typography, controls, overlays and motion belong to Tools.

Ordinary Noto text uses shared configurable roles: `--ztd-font-body` (18px),
`--ztd-font-control` (16px), and `--ztd-font-help` (14px). `app/styles/typography.css`
records that these roles come from the shared Tailwind entry. Existing app roots,
routing, persistence authority, main landmarks and palette policy are retained.
Local dialog, alert-dialog, select, switch, card and button modules delegate to
the delivered shared primitives instead of maintaining another implementation.

`lib/i18n/` owns typed dictionaries, the shared `Locale` re-export and the
request-local instance factory. `components/frontend-root.tsx` creates one instance
per mounted root. `components/i18n/use-messages.ts` derives dictionary strings from
that instance and the existing FrontendProvider locale. Server callers keep the
pure `messages(locale)` API. Direct dependencies pin `i18next@26.4.2` and
`react-i18next@17.0.15`.

Consumer object contracts use TypeScript `type` aliases. The shared `@ztd-me/eslint@0.1.4` package enforces
`ts/consistent-type-definitions: ["error", "type"]`. Handwritten declaration files
retain interfaces where native/global declaration merging is required, with that
rule enforced separately. Server and workflow conversions change declarations,
not runtime authorization, mutation or routing behavior.

## Source and verification boundaries

`ui-source.lock.json` pins the complete 77-file public Tools UI graph at
[`9abea5a57b97f63109fb7dc5255543b53629c3ba`](https://github.com/zeithrold/tools/tree/9abea5a57b97f63109fb7dc5255543b53629c3ba).
Its payload SHA256 is
`0ea6c065dc4da6608fb8b2beb817b8607c03ad694f40af1a49160971c804ddd4`.
The [public-source CI gate](https://github.com/zeithrold/tools/actions/runs/37713345587)
performed a fresh `shadcn@4.21.1` install, checked every public byte and license,
and passed native lint/CSS/types, 14 source-consumer units and 32 real browser cases
with actual Google Fonts. `docs/ui-public-installation.json` preserves its receipt
with a final newline; the source lock records both the original CI receipt hash and
the checked-in receipt hash.

The source guard checks that receipt, upstream and installed hashes, the complete
inventory digest, reviewed adaptations, atomic delivery and exact dependency pins.
It rejects altered bytes, extra files, changed inventory digests and unverified
installation claims. The installed graph is a verified public source rather than a
local candidate. Source updates require a new verified full commit and reviewed
inventory; normal checks use the committed evidence without network access.

All 77 installed files match the public graph without local adaptations.

The exact published `@ztd-me/frontend-checks@0.1.3` package supplies CSS imports,
Tailwind custom variants and application utility inspection. Its TypeScript runtime
dependency belongs to the published package. The consumer adds no checker patch or
package extension; dependency trust and lifecycle policies remain enforced by the
workspace config. Radix and Vaul retain their independently reviewed patches.

Run `pnpm check:code` for strict lint, both TypeScript configurations and the unit
suite, and `pnpm lint:css` for token and utility validation. `pnpm check` runs the
shared native verification workflow, production build/bundle checks, real Worker
preview, synthetic-session browser and axe checks, and actual Google Fonts checks.
Synthetic-session tests use local preview fixtures rather than production data.
Run-specific logs and browser outputs remain under ignored `.zt/` directories.
Production authentication acceptance remains separate from local verification
and a draft pull request.
