# Feature structure, imports and TypeScript contracts

Use `src` as the default application source root. Preserve required framework entries; choose one declared
source root and align the compiler, bundler, SSR build, test runner and component registry with it. Move
files with their imports and native gates together rather than retaining two parallel source trees.

Organize by owner and dependency direction, creating only folders that contain real modules:

- Framework entry/route folders orchestrate pages, loaders and request boundaries.
- `src/features/<feature>` owns its components, hooks, model, validation and API adapters. Keep a small
  public entry when other features need it; do not export server-only modules through a client entry.
- `src/components/ui` owns installed primitives; `src/components/layout` owns shared presentation.
- `src/lib` owns proven generic mechanisms such as the injected i18n bridge; `src/server` owns server
  infrastructure. Feature business rules stay in their feature rather than becoming miscellaneous utils.

Routes compose features; features depend on shared components/lib, never the reverse. Cross-feature
imports use reviewed public entries. Avoid cycles and imports into another feature's private internals.
Colocate a test with its owner or use the project's explicit test tree; neither location changes ownership.

Set `@/*` (or the project's equivalent) to the declared source root. Match that mapping in TypeScript,
the bundler/framework, SSR and test resolver, and `components.json` aliases. Prefer aliases across
feature/layer boundaries; short relative imports within a feature are appropriate. Registry-delivered
source deliberately keeps relative internal ESM imports so its entire module graph remains portable.
Use the consumer alias when importing its public entry; do not rewrite that atomic source graph piecemeal.
Do not infer that a configured alias is missing merely because a file still has relative imports.

Define object contracts with TypeScript `type`, composing with intersections and unions. The tools
ESLint profile explicitly sets `ts/consistent-type-definitions: ['error', 'type']`; retain its existing
consistent type-import rule and full typed safety. A type alias declaration and an import path alias
are distinct requirements. Preserve third-party declarations and framework augmentation mechanisms;
do not edit dependencies or disable rules to normalize project contracts. Run `tsc` and native builds
with strict checking after moving files or changing declarations.
