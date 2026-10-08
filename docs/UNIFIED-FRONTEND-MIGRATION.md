# Source-owned shared frontend integration

Memory owns the editable `@ztd-me/ui` files installed with the real
`shadcn@4.21.1` CLI from approved tools source
[`9abea5a57b97f63109fb7dc5255543b53629c3ba`](https://github.com/zeithrold/tools/tree/9abea5a57b97f63109fb7dc5255543b53629c3ba).
The public recipe is [registry/README.md](https://github.com/zeithrold/tools/blob/9abea5a57b97f63109fb7dc5255543b53629c3ba/registry/README.md).
The upstream public-install gate [CI 37713345587](https://github.com/zeithrold/tools/actions/runs/37713345587)
verified the actual 77-file CLI install, source bytes, licenses and real browser
behavior. This consumer's complete inventory matches that public graph without
local source adaptations. The receipt, hashes and acceptance boundary are recorded
in [the consumer foundation contract](consumer-foundation.md).

`components.json` pins the full source SHA. `ui-source.lock.json` is durable registry
provenance, including the CLI, payload SHA256, dependency pins and per-file hashes;
it is not a transient review report. `scripts/verify-ui-source.ts` verifies that
receipt before every native profile. Source, MIT/shadcn/Noto notices, pnpm dependency
pins and the native lock are committed together. No `@ztd-me/frontend` runtime,
source tarball dependency or font binary is required. Verification helpers remain
`@ztd-me/frontend-checks@0.1.3`.

The installed source provides compact 44px control hit targets, smaller visible
hover surfaces, soft borders and menu enter/exit motion. Reduced motion removes
those animations; exiting menus stop intercepting pointers. Memory supplies brand,
footer, native routing and explicit persistence policy. Business APIs/auth/database
semantics and existing valid current-format preferences are preserved.

The recipe's Select 2.3.7 patch changes only `.d.ts` and `.d.mts`, resolving its Popper
`onPlaced` conflict without editing JavaScript. `pnpm-workspace.yaml` retains all
release-age/trust/build policy and adds that exact patch. `pnpm typecheck` checks
both the existing application project and the source UI project. The latter uses
`skipLibCheck: false`, strict/noUncheckedIndexedAccess and exact optional properties.
The combined browser/Worker application retains its pre-existing `skipLibCheck: true`:
turning it off reproduces DOM/Workers declaration collisions and missing Wrangler
internal declarations, independent of the UI. This split adds strict library checking
for the complete source UI without changing application checks or hiding Radix errors.

Authoring/review follows the updated frontend Skills at the approved UI source SHA.
Existing managed CLI/Skills pins remain unchanged; source ownership is separate from
Skill synchronization.

## Typography, privacy and security

The delivered stylesheet loads the Google Fonts CSS2 API directly: Noto Sans and
Noto Sans SC/JP/KR at 400/500/600/700, plus Noto Color Emoji at 400. Ordinary Memory
content uses the Sans token. No content here benefits from a new Serif face, so unused
Serif families are not loaded. Regional Japanese/Korean `lang` attributes select the
matching CJK variants. Explicit emoji sequences use `.ztd-emoji`; ordinary Latin/digits
remain text. `font-synthesis: none` prevents fake weights. Two back-navigation arrows
are now decorative, 16px Lucide SVGs; genuine prose/math/user content is retained.

Google receives browser network requests, including IP address and normal request
headers. The static query does not send private page text via `text=`. Google controls
returned CSS/fonts and can update them despite the pinned source query. See the
[delivered font contract](../components/ui/ztd-me/fonts.md) and retained OFL notices.
There is no self-hosting or Fontsource dependency.

No CSP/header policy was found in this checkout, and the checked public unauthenticated
response was a 401 with no CSP. This does not establish authenticated production
headers. This migration changes no CSP, secrets, grants or security headers. If an
external authenticated policy blocks fonts, propose only the required additions to
its owner: `https://fonts.googleapis.com` in `style-src-elem` (or `style-src` when that
is the existing directive), and `https://fonts.gstatic.com` in `font-src`. Obtain owner
approval before changing that policy; preserve script/nonce/auth restrictions.

## Reviewed source updates

Preview `pnpm dlx shadcn@4.21.1 add @ztd-me/ui --dry-run` with a new approved full SHA
in a temporary checkout. Compare incoming files with the last accepted source and
local adaptations. Merge changes deliberately; do not overwrite this tree blindly.
Refresh the reviewed source receipt, dependency pins and pnpm lock together, then
repeat the complete native/browser gates. There is no automatic updater or new sync
service. The receipt keeps original upstream hashes and records the README adaptation with
its accepted hash and reason. Verification rejects missing, duplicate, unknown or
unrecorded adaptations, and any later source change must be reviewed explicitly.

## Ownership

| Boundary | Implementation |
| --- | --- |
| Server bootstrap | `lib/server/frontend-preferences.ts` reads request cookies/languages and trusted Worker `APP_ORIGIN` |
| Cookie scope and initial preferences | `lib/frontend-preferences.ts` supplies explicit name/domain/Secure/mirror policy and uses generic current-format parsing/defaults |
| Document provider | `components/frontend-root.tsx` mounts one shared provider from the exact server snapshot |
| Document attributes/styles | `app/layout.tsx` applies shared root attributes and imports the installed CSS once |
| Workspace frame | `ApplicationShell` receives Memory's business navigation, native routing link, account control and security note |
| Business API/auth | `WorkspaceProvider` retains Memory API, Access configuration and translated business context |
| Footer identity | `lib/frontend-config.ts` supplies copyright, repository/contact links and translated accessible names |
| Public documentation/404 | `PublicShell` receives explicit Memory footer configuration and supplies shared controls |
| Content landmarks | Shared shells own the main landmark; route content uses inner containers |
| Business colors | App semantic roles reference declared shared tokens; Tailwind variants follow explicit and system dark modes |

Memory retains its five business destinations, nested-route selection, content,
assets and controls. The footer remains © Zeithrold, this repository's GitHub link
and `hello@ztd.me`, without a year or added service navigation. Native framework
links retain `prefetch={false}`. The original public receipt stays pinned; current
shared-source bytes are independently verified against the complete public-source
inventory rather than being presented as the old public payload.

## Preferences and boundaries

Defaults are neutral grayscale, system mode and negotiated English/Simplified
Chinese. All six palettes support light and dark. Only validated
version/mode/palette/locale enter shared persistence. API clients, auth, accounts,
workspace data and drafts remain local; UI preferences never authorize access.

Memory supplies `createPreferencePolicy({ name, domain?, secure, mirrorKey })`
from trusted `APP_ORIGIN`, never request Host:

| Deployment | Explicit policy |
| --- | --- |
| Exactly `https://memory.ztd.me` | `ztd.frontend.v1`, domain `ztd.me`, Secure |
| Other HTTPS origins | Host-only `ztd.frontend.preview.memory.v1`, Secure |
| HTTP development | Host-only `ztd.frontend.development.memory.v1`, without Secure |

Each policy explicitly uses its current cookie name as the optional same-origin
notification mirror key. The shared source never reads mirror values; only this key is written
after an explicit user preference change. Preview/development ignore the shared
production cookie. Retaining the current cookie name/domain preserves valid existing
version-1 choices directly, without migration.

Missing, invalid or future current-format values use supported defaults and language
negotiation. Neither Memory nor the shared source reads, maps or deletes retired preferences.
Retired keys occur only in negative test fixtures. Hydration/focus/visibility recovery
cannot automatically write preference cookies or mirrors. User changes write only the
configured current keys, leaving old UI and business/auth storage untouched.

The server and first client render use one snapshot. System colors resolve through
CSS media before hydration, and explicit choices remain fixed. Shared locale updates
feed Memory's existing translations and formatting; toasts follow resolved mode.
Denied cookie reads/writes retain usable in-memory controls and show translated
persistence feedback. A reload can return to server defaults. Cross-subdomain sharing
uses cookie recovery on focus/visibility and last-write-wins values.

## Verification and CI

`pnpm install --frozen-lockfile` verifies the actual registry lock. `pnpm check` runs
eight required native gates: strict lint, CSS, types, unit/integration, unsigned
Worker build, unsigned browser checks and a separate configured-session browser
build, and the final failure-evidence integration gate. The configured build uses
synthetic APIs and an inert Access domain, then restores the unsigned artifact.
No live auth/model service or production binding is exercised by these fixtures.

Coverage includes parsing/isolation, current-format preservation, rejection of
retired preferences, SSR/hydration, system media changes, all palettes in light/dark
and both locales, storage denial, keyboard/focus, full-page Axe, navigation, public
landmarks, create/edit/search, recovery, catalog polling/draft retention, dialogs
and logout return origin. Storage probes cover missing, valid, future and malformed
cookies and verify the absence of reads/removals/automatic writes plus current-key
writes after explicit changes. A separate browser fixture intercepts every request
to synthetic origins and verifies actual production domain/Secure sharing and
host-only preview/development isolation without contacting production.

The expected-failure `pnpm test:artifacts` probe verifies that a deliberate Axe
finding retains full scans, HTML/JSON, traces, screenshots and video. Named desktop
and mobile captures support visual review. Visual baselines remain deferred; passing Axe does not certify all accessibility or live services.

CI retains evidence on success/failure. Failure-only diagnostics print failed native
logs directly while preserving the original failure. The earlier main run
[37079965038](https://github.com/zeithrold/memory/actions/runs/37079965038) failed its
configured browser gate; artifact download returned HTTP 403 and exact main passed
locally. Its specific assertion remains unconfirmed.

Production deployment is eligible only after successful checks on a main push:
`github.event_name == 'push' && github.ref == 'refs/heads/main'`. Branch/PR checks
cannot deploy. This integration changes no credentials, workflow permissions or
business/database semantics and performs no manual deployment.

## Source-migration verification and remaining gates

The browser font fixture uses the real built Memory stylesheet/provider and adds
synthetic multilingual content only inside the test browser. It introduces no
production route. CDP checks actual custom Noto glyphs, SC/JP/KR, weight 600, mixed
text, VS16 heart, skin-tone/ZWJ technologist, family, rainbow and regional flag; each
composed emoji must be one custom Noto Color Emoji glyph. CSP violations, fewer than
80 font requests, full-page Axe and captures remain required.

Separate fresh contexts measure real `/memories` in English and Chinese, then reload
normally in the same context. Caps combine encoded font and API CSS response bytes:
500,000 English cold, 1,000,000 Chinese cold and 10,000 each warm. Reports preserve
request/family counts, cache state, encoded responses and decoded bodies separately.
The deliberate full specimen reports transfers without the ordinary-page cap.

Cloud Chromium failed actual Google Fonts with `net::ERR_CERT_AUTHORITY_INVALID`.
An explicit isolated `MEMORY_LOCAL_FONT_PREVIEW` fixture can rewrite only test CSS
responses and serve normally TLS-verified downloads from an external temporary cache.
It leaves built/production CSS unchanged, has no TLS bypass and cannot verify remote
budgets. Reports mark preview-only results; setting this flag in CI throws. Normal CI
requires actual Google Fonts browser delivery and the approved caps.

Public `@ztd-me/eslint@0.1.4` supplies the shared type-alias rule and virtual
Markdown/TS project boundary. Memory uses the exact normal registry dependency,
with ESLint 10.11 and TypeScript 6.0.3 satisfying the published peers. The exact
`@ztd-me/frontend-checks@0.1.3` release supplies Tailwind/CSS validation directly,
with no checker patch or package extension. No tarball/path dependency, new trust
exception or release-age bypass is used.

Memory's final typed-rule override applies to actual TS/TSX source. Its local
`**/*.md/**` exclusion prevents reapplying type-dependent rules to generated code
fences; Markdown markup, syntax, React semantics and strict array layout remain
enforced. The complete resolved configuration for real application source is
unchanged. Negative probes verify unsafe typed source, invalid Markdown TS syntax,
Markdown array layout, invalid React hooks and rejection of real files outside the
selected strict project.

The complete native profile is required, alongside the independent actual-font
workflow. `fonts.yml` verifies source/head metadata, builds the unsigned production
Worker and runs actual Google Fonts desktop/mobile glyph, weight, complete-emoji,
cold/warm transfer, motion, focus and Axe checks. It has no deployment, secrets or
permissions changes. Cloud's isolated font preview cannot substitute for normal CI.

Acceptance requires green checks for the exact PR head, retained artifacts and owner
visual/interaction review. Automated assertions and captures do not establish owner
visual approval. Logs, reports, screenshots and videos remain in ignored artifacts
and CI uploads; only durable source provenance and implementation documents are
committed. The main-push-only production deploy guard remains unchanged.
