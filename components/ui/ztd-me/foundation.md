# Frontend foundation contract

This source item adds editable primitives to the existing shell. Import public components from
`client.ts`, server-safe localization contracts from `index.ts`, and `styles.css` once. Installed modules
remain an atomic relative ESM graph; application code uses its configured source alias. Object contracts
use TypeScript type aliases. Product forms, validation, authentication and words remain consumer-owned.

## Components

| Export | Contract |
| --- | --- |
| Button | Native button props/ref, `asChild`, `variant=default/outline/ghost/destructive`, `size=default/sm/icon`; preserve explicit form type |
| Input, Textarea, Label, Select | Corresponding native element props/ref/children; Select retains native change events, options and form submission |
| Badge | Native span plus `variant=default/secondary/outline/destructive` |
| Card, CardHeader/Title/Description/Content/Footer | Structural surfaces; title is h2, callers own appropriate heading structure |
| SelectRoot/Trigger/Value/Content/Item/Group/Label | Radix select composition with controlled/uncontrolled values and keyboard behavior |
| Checkbox | Radix checked/defaultChecked/onCheckedChange, including indeterminate and hidden native form input |
| Accordion/Item/Trigger/Content, Collapsible/Trigger/Content | Radix disclosure state and keyboard behavior |
| Tabs/List/Trigger/Content | Radix selection, keyboard navigation and associated panels |
| Dialog, AlertDialog, Sheet families | Radix modal/focus semantics; Content inherits provider portal container, optionally overrides `container`; SheetContent has top/right/bottom/left `side` |
| ScrollArea, ScrollBar | Radix native scroll viewport; ScrollArea has viewportClassName/viewportProps and vertical/horizontal/both scrollbars |
| Tooltip/Provider/Trigger/Content | Radix hover/focus tooltip; portal ownership is inherited |

Content wrappers do not inject fixed-English controls. Compose DialogClose/SheetClose or
AlertDialogCancel/Action with `asChild` and a Button carrying consumer-localized text/accessible name.
Provide each modal's Title and Description, and handle asynchronous confirmation with controlled open
state owned by the consumer. An icon-only button needs an accessible name. Overlays preserve Radix props,
including `onCloseAutoFocus`; do not manually remount a form to close or translate it.

ScrollArea's outer container needs a real height or a resolved flex/grid size; its viewport is 100% of
that size. `viewportProps` can supply an accessible region name and tabIndex for a keyboard scroll area.
Wheel, touch and keyboard scrolling use the browser's native viewport; no scroll transform is introduced.
Use ordinary document overflow where custom scrollbar appearance is unnecessary. FrontendProvider's
`styleNonce` reaches the viewport's injected style; its `portalContainer` keeps overlays in a fullscreen
root. The host still owns CSP and must retain the documented Radix style-attribute policy.

## Typography

Defaults are `--ztd-font-body:18px`, `--ztd-font-control:16px`, `--ztd-font-help:14px` and
`--ztd-font-heading:22px`. Related body/control/help line-height tokens are 1.65/1.5/1.5. Reading content,
controls and supporting copy consume the appropriate role; consumers may override these tokens in their
own source contract. No project-name branch chooses a scale. Noto Sans/CJK and Noto Color Emoji continue
to load through Google Fonts, with the existing nonce and license mechanisms intact. Destructive actions
and modal backdrop use explicit semantic color tokens.

## Injected localization

The host constructs and registers its translation engine; the source item constructs no engine or
second preference store. `createI18nAdapter({instance, resources})` requires an object whose
`translate({locale,namespace,key,values})` delegates to that engine. Locale is passed on every call;
there is no global changeLanguage side effect. Keep business messages with the consumer.

```ts
const _adapter = createI18nAdapter({
  resources: { en: englishCatalog, 'zh-CN': chineseCatalog },
  instance: {
    translate: ({ locale, namespace, key, values }) =>
      hostEngine.t(key, { ...values, lng: locale, ns: namespace }),
  },
})
// Server: _adapter.t(initialPreferences.locale, 'editor', 'save')
// Client: const { t } = useI18n(_adapter); t('editor', 'save')
```

Namespace/key types derive from the English catalog's shape; translated text need not be the same
literal. `validateI18nResources` checks both supported locales for missing/extra namespaces and keys,
blank/non-string text and `{{name}}` interpolation parity. The factory rejects incomplete coverage.
Formatting, plural forms, escaping and engine initialization remain host-owned. Keep keys flat within
explicit namespaces, or flatten an existing nested catalog in the host bridge.

Create mutable server engines per request and initialize them before SSR. Use the resolved preference
locale for both SSR translation and initial browser preferences. Create one stable browser engine per
mounted root and inject its adapter; `useI18n` derives language from the existing FrontendProvider.
Changing locale keeps the instance and form tree, preserving unsaved input. Do not independently persist
engine language or create another default singleton. A provider/store instance cannot be inferred from
the number of message files alone.

## Dependency and delivery boundary

Individual exact Radix packages provide behavior. Preserve the Select 2.3.7 declaration-only pnpm patch
when strict consumers use `exactOptionalPropertyTypes:true` and `skipLibCheck:false`; new public primitive
types reach its declarations. The private packed/source harness installs the same documented patch.
[Radix ScrollArea](https://www.radix-ui.com/primitives/docs/components/scroll-area) describes native scroll
behavior; [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) documents focus/keyboard
semantics. Dependencies remain MIT under their upstream notices; RADIX-MIT.txt preserves WorkOS's notice.

An unmerged local source item or private packed artifact is a candidate. Record its local path/hash and
actual checks as such; never label it a public approved-source receipt. Final consumer acceptance follows
the existing owner review, full approved source SHA and fresh public installation contract. These APIs
do not authorize package publishing, push, merge or deployment.

## Tailwind source contract

Import Tailwind CSS 4.3.3 first, then the installed `tailwind.css`, and include this source directory
in Tailwind's source detection. The entry maps runtime tokens to semantic utilities and provides the
explicit/system dark variant. Runtime palettes and typography live in base; native overlay motion
and Vaul behavioral adaptation live in components. Consumer utilities can override components.
All component className props use the shared `cn`, including text body/control/help/heading roles.
The private packed verification artifact compiles the same source classes with native Tailwind;
source consumers own compilation. Do not copy the compiled verification artifact into a registry item.

`Drawer` composes Vaul's controlled/uncontrolled Root and `DrawerContent` inherits portal ownership.
The exact Vaul patch and static stylesheet are atomic with the source item, preserving nonce CSP.
Provide consumer-localized Title, Description and a reachable DrawerClose. `SettingSection` accepts
title, optional description/summary/status, native Collapsible open/defaultOpen/onOpenChange and
children; callers own data loading. `ColorGrid` accepts one labeled group of explicit options, value
and onValueChange; each option supplies value/label and optional CSS foreground/background colors.
It contains no editor schema or product palette. `Switch` retains native Radix checked and form behavior
with a 44px touch target. Badge adds success/warning/info semantic variants at a consistent size.

The Serif token includes CJK and Color Emoji fallback without requesting Serif fonts by default.
Reading consumers may import `styles/fonts-serif.css` and apply font-serif to their prose scope.
Sans and Serif requests use variable 400..700 weight ranges; CSP still permits Google's existing
CSS/font origins. This source candidate is local until owner review and a public approved-SHA install.
