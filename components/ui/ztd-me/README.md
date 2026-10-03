# @ztd-me/ui source registry

This is editable source delivery, not an npm UI runtime package. Namespace `@ztd-me` and item `ui`
produce the public identity `@ztd-me/ui`. Namespace aliases are consumer configuration, not globally
reserved npm names. The root `registry.json` is the canonical file inventory; `registry/ui.json` is its
generated, self-contained item payload. Source files currently share the legacy package's source
directory during the reviewed transition, avoiding two separately maintained implementations.

The owner approved the compact chrome and source delivery direction. This branch is submitted through
a draft PR; the owner retains merge. Use an approved full source SHA and verify a fresh public install
after merge before consumer migrations. No automatic updater or production migration is included.

## Install a pinned source revision

Use the full approved 40-character source commit, replacing `<SOURCE_SHA>` below. In the consumer's
existing `components.json`, add the registry entry while preserving all existing aliases and settings:

```json
{
  "registries": {
    "@ztd-me": "https://raw.githubusercontent.com/zeithrold/tools/<SOURCE_SHA>/registry/{name}.json"
  }
}
```

Preview and install through the exact tested CLI version:

```sh
pnpm dlx shadcn@4.21.1 add @ztd-me/ui --dry-run
pnpm dlx shadcn@4.21.1 add @ztd-me/ui
```

Alternatively, the GitHub source route requires no registry alias:

```sh
pnpm dlx shadcn@4.21.1 add 'zeithrold/tools/ui#<SOURCE_SHA>' --dry-run
pnpm dlx shadcn@4.21.1 add 'zeithrold/tools/ui#<SOURCE_SHA>'
```

The item installs under `aliases.ui` in a `ztd-me/` directory. `@ui/` target placeholders preserve the
consumer's configured directory; they do not impose a fixed application path. All internal imports stay
relative, and the provider, context, hook, components and styles are delivered together. Required React,
Radix, icon and nonce dependencies are explicitly pinned in the item. Review dependency changes
before accepting them. No installed source imports or depends on `@ztd-me/frontend`.

## Required strict TypeScript compatibility patch

The selected Radix Select 2.3.7 declarations conflict with Popper 1.3.7 on `onPlaced` (TS2320). The item
includes a declaration-only patch for both `.d.ts` and `.d.mts`; it changes no JavaScript. Preserve strict
library checking. For the usual `aliases.ui = components/ui` layout, merge this field into the consumer's
existing `pnpm-workspace.yaml`, preserving its security policies and unrelated patches:

```yaml
patchedDependencies:
  '@radix-ui/react-select@2.3.7': components/ui/ztd-me/patches/@radix-ui__react-select@2.3.7.patch
```

Adjust the patch path to the actual configured `ui` directory, then run `pnpm install` and commit the
resulting native lock. The registry does not overwrite workspace configuration automatically. The
source-install gate verifies this exact patch with `skipLibCheck: false` and reproduces the unpatched
diagnostic. Review and remove the patch only when a verified upstream release fixes the declarations.

## Consume and own the source

For the same example layout, the server-safe entry is `components/ui/ztd-me/index.ts`, the client entry
is `components/ui/ztd-me/client.ts`, and the stylesheet is `components/ui/ztd-me/styles.css`. Import these
through the consumer's own aliases or relative paths. The stylesheet includes font, tokens, shell and
motion CSS. Fonts load directly from the Google Fonts API, with English/CJK Noto Sans and Noto Color
Emoji for all emoji. There are no font binaries or Fontsource dependencies. Read the delivered `fonts.md` for
language-specific glyphs, weights, third-party requests, CSP, privacy and remote-font mutability.
Preserve the delivered MIT and Noto OFL notices.

Use the installed Lucide components for action, navigation and status icons, with consistent size,
stroke and alignment by role. Give icon-only controls an accessible name; decorative SVGs use
`aria-hidden="true"`. Preserve prose, mathematics, user content and intentional Noto Color Emoji.

```tsx
import { createPreferencePolicy, resolveInitialPreferences } from './components/ui/ztd-me/index.js'
import { FrontendProvider, PublicShell } from './components/ui/ztd-me/client.js'
import './components/ui/ztd-me/styles.css'

const policy = createPreferencePolicy({ name: 'consumer.ui.v1', secure: true })
const initialPreferences = resolveInitialPreferences({ policy })

export function Example() {
  return (
    <FrontendProvider initialPreferences={initialPreferences} policy={policy}>
      <PublicShell brand={{ label: 'Consumer', homeHref: '/' }}>
        <h1>Consumer-owned content</h1>
      </PublicShell>
    </FrontendProvider>
  )
}
```

Consumers supply branding, footer, routing adapter, persistence name/domain/Secure choice, optional
notification key and business slots. Server applications resolve their request's cookie and language
headers explicitly. Consumers own nonce/CSP, deployment, authentication and business state. No hostname
or project-name dispatch and no legacy preference mapping is delivered.

## Reviewed updates

Change the pinned source SHA in the registry alias and preview `add @ztd-me/ui --dry-run` or `--diff`.
Stage incoming source in a temporary checkout, review changes against the last accepted revision and
merge local adaptations deliberately. Commit source, dependency pins and lock together; record the item
SHA and CLI version in the consumer's own documentation. No automatic overwrite or synchronization
service is provided, and existing Skill synchronization does not own these files.

Run native lint, CSS, strict types, unit, build and browser checks, including SSR/theme first paint,
keyboard/focus/inert, reduced motion, narrow reflow and Axe. Test the rendered diff and obtain owner
visual/interaction acceptance. Source copying alone does not establish compatible Radix instances.
Audit consumer-owned action/navigation/status iconography: replace Unicode/emoji icon substitutes with
Lucide, preserve meaningful content and intentional emoji, and recheck names, alignment and glyph use.

## Local maintenance and validation

From the tools repository root:

```sh
pnpm dlx shadcn@4.21.1 build registry.json --output registry
```

From `packages/frontend`, the transitional verification harness:

```sh
pnpm run check
pnpm run test:source
```

The second gate installs the local item with the real shadcn CLI in a disposable synthetic consumer,
applies the documented pnpm patch, verifies no frontend runtime dependency, and runs native strict gates
and the complete browser suite. Its loopback server exists only for the test; it is not registry hosting.

After the owner merges the approved revision, check out that exact full SHA and run:

```sh
node scripts/source-smoke.mjs <SOURCE_SHA>
```

This mode installs from the pinned public GitHub item, compares its payload with the checked-out source,
checks every installed file byte, and repeats the native and browser gates in a fresh consumer. Only a
successful receipt with `publicInstallationVerified: true` satisfies the post-merge public-install gate.
