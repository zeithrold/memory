# Unified frontend migration checkpoint

Preparation starts from Memory main `29399091d74bf6ade148483edece2db7305d7f1d`.
The Cloud executor and checkout were confirmed with successful commands and a fetch.
The shared `@ztd-me/frontend` implementation is a dependency owned by tools. Integrate
only after the parent supplies its verified stable API, source revision, public version
and registry verification evidence. No speculative API or vendored copy is introduced.

## Approved target

Adopt the shared shadcn/Radix shell with neutral grayscale as Memory's default and the
existing five colorful palettes as selectable options. Support light/dark/system with
system as the default. Share only validated, versioned, non-sensitive appearance and UI
locale across production `ztd.me` subdomains. Account, auth and business state stay local.
Storage failures, deterministic SSR/hydration, and local/preview isolation are required.
The shared footer shows © Zeithrold, this repository's GitHub link and `hello@ztd.me`.
Memory retains its business navigation, route content, assets and project controls.

## Replacement map

| Current owner | Prepared boundary | Integration after the package gate |
| --- | --- | --- |
| `app/layout.tsx` | Root language and CSS entry | Verified server preference reader/bootstrap and shared stylesheet; deterministic first render |
| `app/(workspace)/layout.tsx` | Build-time Access/Sentry values | Keep Memory's environment and auth inputs local; pass verified initial preferences |
| `components/workspace-shell.tsx` | Legacy sidebar/topbar/skip target, language toggle and branding | Replace frame and host-only locale persistence using the shared shell/provider contract |
| `components/workspace-navigation-model.ts` | Five route definitions and nested-route selection | Adapt to verified navigation slots/types; retain Memory route ownership and native links |
| `components/workspace-navigation.tsx` | Translated native business links and active page semantics | Reuse business navigation through the supported shared integration point |
| `components/workspace-account-control.tsx` / `lib/access-logout.ts` | Access logout and return origin | Keep project-specific account action; do not place it in shared preference storage |
| `components/workspace-provider.tsx` / `workspace-context.ts` | API, auth state and translated business context | Bridge the verified UI locale into Memory while keeping API/session state outside shared persistence |
| `app/globals.css` / `css-check.config.mjs` | App semantic/layout tokens and explicit CSS declaration inventory | Map app roles to verified shared neutral/palette/mode tokens without legacy root values overriding them |
| `components/ui`, `PageHeading`, `SetupBanner`, `observability.tsx` | Existing business controls, recovery, toasts and telemetry | Preserve their contracts and confirm shared styling/focus integration; no speculative wholesale replacement |
| `lib/i18n` and route errors | Typed English/Simplified Chinese content and locale formatting | Preserve translations and define legacy host-cookie migration using the verified preference contract |

Preparation extracts existing business/account/provider ownership. The running shell
continues to use its current implementation until the dependency gate opens. Its public
props and `Api` type re-export remain compatible. No preference schema, shared cookies,
new theme implementation, dependency/security exception or auth change is added here.

## Contract needed from tools

- Exact public version, reviewed source SHA, exports, type declarations, peer ranges and
  stylesheet entry compatible with React/Vinext/Tailwind; install the registry package.
- Shell navigation/link rendering, branding, footer, account/action slots and accessible
  preference controls; Memory must keep native framework links and business routes.
  Existing pages own their `main` landmarks, so shell content wrapping must avoid nesting
  another `main`; the shared skip link needs a supported focus target.
- Supported locale/palette/mode unions, defaults and token declarations; all mode/palette
  CSS mappings must pass strict token checks and rendered contrast tests.
- Versioned preference parsing/serialization, server initial values and client bootstrap,
  legacy locale migration, cookie domain/security rules, system-media subscriptions and
  local/preview isolation. Unknown/corrupt/stale values and storage failures need safe defaults.
- Evidence that preference storage contains no auth, user/account, API or business state.

## Completion checklist

1. Install the verified public package and actual peers using pnpm; preserve the own-scope
   release-age exception, no-downgrade trust, semver 6.3.1 exception and existing build grants.
2. Replace only the frame/preference owners above. Apply approved neutral/system defaults,
   five palettes and footer; preserve app routes, controls, content and non-sensitive locale.
3. Retain strict CSS/ESLint/typed checks. Include the shared token declaration sources;
   avoid broad ignores, disables or accessibility exclusions.
4. Add preference/migration regressions for malformed/stale data, denied storage, host-only
   previews, production-domain sharing, SSR/hydration, reload, navigation and system changes.
5. Exercise all supported modes/palettes and locales in desktop/mobile browser/Axe/keyboard
   flows, preserving create/edit/search, polling drafts, dialogs and the account boundary.
6. Run frozen install and all required native unit/integration/build/browser gates. Retain
   reports and failure artifacts, verify the exact pushed head's CI, and keep the PR draft.
7. Verify production deploy remains eligible only for main pushes. Do not merge, manually
   deploy, alter credentials or promote npm releases.

Visual baselines and performance budgets remain deferred. Real Access/OAuth, remote
bindings and paid/live models are outside the synthetic local browser fixtures.
