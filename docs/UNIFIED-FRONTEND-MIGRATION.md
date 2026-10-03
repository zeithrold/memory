# Shared frontend integration

Memory uses exact public releases `@ztd-me/frontend@0.2.0` and
`@ztd-me/frontend-checks@0.1.1`, with a real registry lockfile. The frontend release
is tools merge `1e8b408ccf165d1b0aa5eca679f9ea62a82cd1a3`, whose tree matches reviewed
source `757ecc6ae77a361680efb9e5875815ff28a65146`. Its public tarball SHA256 is
`0dbe39fb76dbfd7d45a3d581fb4b66f9e5546ff4736c9e85028874377fda6c5c`.

The SDK contains generic chrome, preference validation and persistence mechanisms.
Memory supplies branding, footer links, deployment/storage policy and business slots.
There is no Project union, named-project branch, fixed identity/domain or legacy
reader/mapping in the SDK. Existing pnpm security policies/build grants, strict
checks and CLI/Skill pins are retained. React/react-dom 19.3.0 satisfy >=19.2 <20
peers. No source tarball dependency, vendored code or consumer package patch is used.

## Ownership

| Boundary | Implementation |
| --- | --- |
| Server bootstrap | `lib/server/frontend-preferences.ts` reads request cookies/languages and trusted Worker `APP_ORIGIN` |
| Cookie scope and initial preferences | `lib/frontend-preferences.ts` supplies explicit name/domain/Secure/mirror policy and uses generic current-format parsing/defaults |
| Document provider | `components/frontend-root.tsx` mounts one shared provider from the exact server snapshot |
| Document attributes/styles | `app/layout.tsx` applies shared root attributes and imports the packaged CSS once |
| Workspace frame | `ApplicationShell` receives Memory's business navigation, native routing link, account control and security note |
| Business API/auth | `WorkspaceProvider` retains Memory API, Access configuration and translated business context |
| Footer identity | `lib/frontend-config.ts` supplies copyright, repository/contact links and translated accessible names |
| Public documentation/404 | `PublicShell` receives explicit Memory footer configuration and supplies shared controls |
| Content landmarks | Shared shells own the main landmark; route content uses inner containers |
| Business colors | App semantic roles reference declared shared tokens; Tailwind variants follow explicit and system dark modes |

Memory retains its five business destinations, nested-route selection, content,
assets and controls. The footer remains © Zeithrold, this repository's GitHub link
and `hello@ztd.me`, without a year or added service navigation. Native framework
links retain `prefetch={false}`. Shared CSS is unchanged from the previous release.

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
notification mirror key. The SDK never reads mirror values; only this key is written
after an explicit user preference change. Preview/development ignore the shared
production cookie. Retaining the current cookie name/domain preserves valid existing
version-1 choices directly, without migration.

Missing, invalid or future current-format values use supported defaults and language
negotiation. Neither Memory nor the SDK reads, maps or deletes retired preferences.
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
seven required native gates: strict lint, CSS, types, unit/integration, unsigned
Worker build, unsigned browser checks and a separate configured-session browser
build. The configured build uses synthetic APIs and an inert Access domain, then
restores the unsigned artifact. No live auth/model service or production binding
is exercised by these fixtures.

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
and mobile captures support visual review. Visual baselines and performance budgets
remain deferred; passing Axe does not certify all accessibility or live services.

CI retains evidence on success/failure. Failure-only diagnostics print failed native
logs directly while preserving the original failure. The earlier main run
[37079965038](https://github.com/zeithrold/memory/actions/runs/37079965038) failed its
configured browser gate; artifact download returned HTTP 403 and exact main passed
locally. Its specific assertion remains unconfirmed.

Production deployment is eligible only after successful checks on a main push:
`github.event_name == 'push' && github.ref == 'refs/heads/main'`. Branch/PR checks
cannot deploy. This integration changes no credentials, workflow permissions or
business/database semantics and performs no manual deployment.
