# Public ESLint typed Markdown project failure

Reproduced with Node 24.19.0, TypeScript 6.0.3, ESLint 10.11.0 and public
`@ztd-me/eslint@0.1.1`. A README TSX fence is processed into a virtual file, but the
factory applies `parserOptions.project` to the syntax parser as well as actual typed
files. The virtual file cannot belong to the application's TypeScript project. The
factory's typed-rule config already excludes Markdown; parser options do not.

The Memory trigger is the delivered `components/ui/ztd-me/README.md` example.
`pnpm exec eslint components/ui/ztd-me/README.md --max-warnings=0` fails at line 77.
No installed source file was edited to evade this. App typed/framework checking and
the full lint command remain enabled.

## Minimal reproduction

Create a standalone ESM directory using the same public package/dependency versions
and ordinary package-manager policies. No Memory override is needed:

| File | Contents |
| --- | --- |
| package.json | `{ "private": true, "type": "module" }` plus the dependencies above |
| eslint.config.js | Import default `config` from `@ztd-me/eslint`; export `config({ react: true })` |
| tsconfig.json | `strict: true`, `noUncheckedIndexedAccess: true`, `jsx: "react-jsx"`, `module: "esnext"`, `moduleResolution: "bundler"`, `types: ["react"]`; include only `probe.tsx` |
| probe.tsx | An exported `Demo(): React.JSX.Element` function returning a paragraph |
| README.md | The same function inside a fenced block whose language is `tsx` |

Run `eslint README.md --max-warnings=0`. Actual result:

```text
Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser.
The file was not found in any of the provided project(s): README.md/0_0.tsx
```

Expected: the documentation example receives the package's intended Markdown syntax
checks; real TS/TSX continues to receive every strict typed/framework rule. Upstream
should fix parser scoping and add a regression against the public factory, then
publish/verify the corrected release. Memory does not add ignores, rule disables,
untyped application parsing or a package patch for this issue. The source migration
remains blocked on full lint and exact-head CI until that release is available.
