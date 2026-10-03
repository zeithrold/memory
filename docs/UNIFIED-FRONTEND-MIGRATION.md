# Shared frontend integration

**Draft blocked on the generic frontend SDK contract and its public release.**
The owner requires generic shared logic, explicit consumer branding/links/domain/
storage configuration, and no legacy preference migration in either package or
consumer. The current `0.1.0` integration is not ready to merge. Memory's server
bootstrap no longer reads or migrates old preferences; the installed SDK still does
so after hydration and must be replaced after the revised package is published.

The draft currently installs public registry releases `@ztd-me/frontend@0.1.0` and
`@ztd-me/frontend-checks@0.1.1`. Their implementation is tools merge
`de4ec8fdab86c40789fdf02b82601350a12e111d`. The companion checker patch supports
Tailwind block custom variants while retaining invalid nesting, property, token and
literal-color checks. No source tarball, local-file dependency or consumer Radix patch
is required. Existing pnpm security policies, build grants, strict ESLint and CLI/Skill
pins are retained. React/react-dom 19.3.0 satisfy the shared package's >=19.2 <20 peers.

## Ownership

| Boundary | Implementation |
| --- | --- |
| Server bootstrap | `lib/server/frontend-preferences.ts` reads request cookies/languages and trusted Worker `APP_ORIGIN` |
| Cookie scope and initial preferences | `lib/frontend-preferences.ts` delegates current-format parsing and defaults; no consumer migration |
| Document provider | `components/frontend-root.tsx` mounts one shared provider from the exact server snapshot |
| Document attributes/styles | `app/layout.tsx` applies shared root attributes and imports the packaged CSS once |
| Workspace frame | `ApplicationShell` receives Memory's business navigation, native routing link, account control and security note |
| Business API/auth | `WorkspaceProvider` retains Memory API, Access configuration and translated business context |
| Public documentation/404 | `PublicShell` supplies the same appearance/language controls and footer without a cross-site menu |
| Content landmarks | Shared shells own the main landmark; route content uses inner containers |
| Business colors | App semantic roles reference declared shared tokens; Tailwind variants follow explicit and system dark modes |

The shared shell replaces the legacy sidebar/topbar preference owners. Memory retains
its five business destinations, nested-route selection, content, assets and controls.
The footer is © Zeithrold, this repository's GitHub link and `hello@ztd.me`, without a
year or added service navigation. Native framework links retain `prefetch={false}`.

## Preferences and boundaries

Defaults are neutral grayscale, system mode and negotiated English/Simplified Chinese.
All six palettes support light and dark. Only validated version/mode/palette/locale
enter shared persistence; API clients, auth, accounts, workspace data and drafts remain
local. UI preferences never authorize access.

Cookie policy is selected from trusted `APP_ORIGIN`, never request Host. Only the exact
HTTPS production origin `https://memory.ztd.me` enables the shared production cookie on
`ztd.me`. Other HTTPS origins use host-only preview preferences; HTTP development uses
its own Memory namespace. Preview requests ignore production preference cookies.

A valid current-format selection supplies the server snapshot. Missing, invalid or
future values use supported defaults and language negotiation. Old preference keys
are not read, mapped or deleted by Memory. No auth/business storage is changed. The
revised SDK must also remove its automatic client migration; current `0.1.0` still
contains that behavior, so client compliance is pending. The package owns generic
normalization, serialization, recovery subscriptions and preference storage.

The server and first client render use one snapshot. System colors resolve through CSS
media before hydration, and explicit choices remain fixed. Shared locale updates feed
Memory's existing translations and formatting. Toasts follow the resolved mode. Denied
cookie reads/writes retain usable in-memory controls and display translated persistence
feedback; a reload can return to server defaults. Local storage remains an optional
notification mirror. Cross-subdomain sharing uses cookie recovery on focus/visibility
and last-write-wins values, rather than an atomic or instantaneous broadcast.

## Consumer configuration audit

These values and boundaries must remain explicit Memory configuration under the
revised SDK contract. They are requirements, not proposed API field names.

| Project dependency | Current location and required consumer value |
| --- | --- |
| Trusted deployment origin | Worker `APP_ORIGIN`; production is exactly `https://memory.ztd.me`, never arbitrary request Host |
| Production preference policy | Cookie name `ztd.frontend.v1`, domain `ztd.me`, secure HTTPS; only validated UI fields are shared |
| Preview/development policy | Host-only `ztd.frontend.preview.memory.v1` / `ztd.frontend.development.memory.v1`; development HTTP is permitted |
| Workspace branding | Existing translated `t.brand`, Brain mark, `/memories` home link |
| Public branding | `Shared Memory`, Brain mark, `/memories` home link |
| Footer content | © Zeithrold, `https://github.com/zeithrold/memory`, `hello@ztd.me`; no year |
| Native routing | `FrontendLink` uses Next links with `prefetch={false}` |
| Business slots | Memory navigation, account/logout, Access security note and main landmark remain consumer-owned inputs |
| Translation/theme bridge | Shared locale feeds Memory messages and formatting; resolved mode feeds toasts |
| Persistence feedback | Memory translates the SDK's persistence-unavailable status; no business data enters preferences |

The published SDK currently constrains namespaces to a fixed `Project` union,
derives cookie names/domain from project/environment branches, fixes the footer
identity/contact, and performs browser legacy migration. The new API must permit
explicit generic policy and footer configuration without those branches. The exact
SDK contract and version are pending from tools. No guessed adapter, patched package,
temporary tarball dependency, storage cleanup, auth change or check exemption is used.

## Verification and CI

`pnpm check` runs the required native profile: strict lint, CSS, types, unit/integration,
unsigned Worker build, unsigned browser checks and a separate configured-session
browser build. The configured build uses synthetic APIs and an inert Access domain,
and restores the unsigned artifact before returning. No live auth/model service or
production binding is exercised by these fixtures.

Coverage includes current preference parsing/isolation and retired-cookie rejection, SSR and hydration,
system media changes, all palettes in light/dark and both locales, denied cookie reads
and writes, keyboard/focus behavior, full-page Axe, route navigation, public landmarks,
create/edit/search, service recovery, catalog polling/draft retention, translated
dialogs and logout return origin. Scrollable public JSON examples are keyboard
focusable. `pnpm test:artifacts` deliberately triggers an Axe finding and verifies that
HTML/JSON, trace, screenshot and video evidence survive a failed test.

CI retains the full evidence directory on success/failure. A failure-only step prints
failed native check logs into the Actions log, preserving the original failure result.
This addresses the diagnostic gap seen in main run
[37079965038](https://github.com/zeithrold/memory/actions/runs/37079965038): its configured
browser gate failed, the artifact download returned HTTP 403, and the exact merge
commit passed the complete profile locally. The specific original CI assertion remains
unconfirmed; this integration does not claim to have reproduced it.

Production deployment remains eligible only after successful checks on a main push:
`github.event_name == 'push' && github.ref == 'refs/heads/main'`. Branch/PR checks cannot
deploy. No manual deployment, credential change or workflow permission change is part
of this migration. Visual baselines and performance budgets remain deferred.
