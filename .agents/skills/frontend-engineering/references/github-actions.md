# GitHub Actions contribution contract

Use this common construction for frontend application workflows. Keep native scripts and `zt.json`
in charge of verification; tools shares mechanisms and conventions, not application commands,
deployment identifiers, secret names/values or business decisions. Existing explicit owner instructions
and authorization boundaries prevail. This reference does not authorize a deployment or package release.

## Workflow shape and triggers

Prefer one application CI workflow with `Verify` and `Deploy` jobs (`verify` and `deploy` IDs).
Use a short stable filename such as `ci.yml` and the application workflow name `CI & Deploy`. Keep existing
required-check names stable unless their migration is reviewed with the repository owner. Library
matrices and separately authorized release/staging workflows retain their own purpose; this contract
does not turn library main pushes into direct package publication.

Order top-level keys as `name`, `on`, `permissions`, `concurrency`, optional `env`, then `jobs`.
Run the same required verification on pull requests and pushes to `main`. The application deployment
job depends on successful verification and runs automatically only for a `push` to `refs/heads/main`.
Do not introduce manual dispatch, enable/confirm inputs or a separate activation requirement for this
approved automatic path. Existing environment approval and credential restrictions remain intact.
Path filters and conditional jobs must not omit a required check or leave its status pending.

Check out the immutable workflow SHA with `persist-credentials: false` and record that actual SHA.
On a PR this may be its generated merge revision; any additional head-only check is an explicit local
extension. For main,
verification, build provenance and deployment must identify the same immutable workflow commit;
never fetch a moving branch tip as a substitute for the revision that passed. If an existing separate
workflow handles deployment, validate the originating event, branch, successful result and source SHA.
`workflow_run` is privileged and fires regardless of the earlier conclusion; a completion event alone
does not establish success. Use `pull_request` for executing PR code, keeping credentials away from
untrusted PR execution. [GitHub event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

Default verification permissions to `contents: read`. Grant any additional permission at the job that
requires it, preserving existing scopes and environment boundaries. Declare working directories and
bounded timeouts explicitly. Use lowercase kebab-case IDs and short English step names describing the
action. Meaningful extension steps follow the same style and state their dependency in the ordering.

## Common Verify sequence

Keep the following role and step ordering. A project supplies its native arguments and fixture setup
behind these names; do not embed those commands or deployment policies in the shared Skill.

| Step name | Contract |
| --- | --- |
| Checkout the workflow commit | Check out the selected immutable revision and retain its identity. |
| Setup pnpm | Use the exact project package-manager version; disable implicit installs. |
| Setup Node.js | Use the Node 24 verification baseline and configure the one chosen store cache. |
| Install dependencies | Run `pnpm install --frozen-lockfile` in the declared workspace. |
| Setup Go for verification | Use the reviewed Go toolchain for installing the verification CLI. |
| Install reviewed zt CLI | Install the project's existing full source-SHA pin; record and verify its identity. |
| Record verification provenance | Retain source SHA, lock SHA-256, Node/pnpm/CLI versions and compiler/module identity in the native artifact root. |
| Install Chromium | Provision the browser and OS dependencies required by the pinned browser runner. |
| Verify frontend and production Worker | Run `pnpm check` through the project's reviewed native profile and `zt.json`. |
| Show failed native checks | On failure, expose retained native reports without masking the original failure. |
| Upload verified build | Upload only a qualified production artifact, with source identity, after required checks pass. |
| Upload frontend verification evidence | Retain configured reports and attachments on success or failure. |

The verification Go baseline is **1.27.1**, a stable release with supported runner distributions in
the [official Go downloads](https://go.dev/dl/). Select it explicitly for this common CLI setup rather
than a moving `stable` alias. A project's own Go module/toolchain requirement remains a separate
native contract. Keep the reviewed zt source pin independent of the compiler version.

`pnpm check` must preserve every required native gate: lint/CSS, types, existing unit and integration
tests, production build/runtime tests and browser/accessibility checks as declared by the project.
Order subchecks by real dependencies; tests importing built output follow that build. Browser checks
must use the intended built runtime. Where the project has no Worker, document its actual production
runtime extension rather than inventing one. Keep browser provisioning explicit even on a cache hit.
Preserve actual font/glyph/weight and cold/warm transfer-budget checks inside the native browser gate.
Dedicated accessibility, coverage and business suites remain project-owned required gates; the common
wrapper must not replace or unnecessarily rerun them. Runtime matrices outside this application
baseline remain reviewed extensions, particularly for libraries supporting multiple Node versions.

The **failure-evidence probe is a required native test** in the reviewed profile. It succeeds only
when a deliberately failing synthetic check reports failure, stops required later work, returns the
expected nonzero result and retains the required evidence. The probe itself exits zero only after
validating those outcomes. The aggregate gate must fail if the probe
fails. Diagnostic printing is not a replacement for this test, and adding it must not drop unit,
integration, coverage or production runtime tests. Required checks must not use `continue-on-error`,
error-swallowing shell fallbacks or undocumented skips to appear green.

The final required native integration/evidence gate asserts retention of the declared reports and
attachments. Required failure stops later native gates, recorded as `not_run`. The outer diagnostic
and upload steps expose/transport existing evidence; they do not replace this required native gate.

Keep framework builds and browser fixture builds distinct from deployable production output. A
fixture compiled with synthetic authentication or test configuration is never a production artifact.
When production needs protected authentication or reporting settings, preserve the separate approved
production build and qualify that output after verification. Do not substitute the fixture build
merely to fit the common upload step. A separate production producer is an explicit local extension.

## Pins, installation and caching

Pin external Actions to reviewed **full commit SHAs**, with a release-version comment. Align pins for
the same Action across equivalent workflows/jobs; update them deliberately with runtime/input
compatibility checks. Read pnpm and runtime versions from the project contracts and keep any necessary
workflow declaration consistent. Do not add a second bootstrap framework or reusable workflow layer
just to share these conventions.

The pnpm setup precedes Node's pnpm cache initialization because the cache needs the package manager
installed. Keep `run_install: false` when using the existing pnpm setup Action; the frozen install is
an explicit later step. Validate the chosen runner and setup Action runtime support before changing
this sequence. [pnpm setup options](https://github.com/pnpm/action-setup),
[Node setup and cache requirements](https://github.com/actions/setup-node).

Use one pnpm store cache implementation, scoped to the correct workspace lockfile and compatible
runner/toolchain. Restore misses must still install and verify normally. Do not cache `node_modules`
as a substitute for installation, skip frozen installs on hits, or treat a cached build as a verified
deployment artifact. Preserve release-age, integrity, no-downgrade and dependency-build policies and
their already approved exceptions. A cache is an optimization; the gate must work without it.
Browser caches, native module ABI keys and other project-specific caches are documented extensions.
Privileged deployment jobs retain their existing cache trust boundary.

## Failure evidence and concurrency

Upload the declared evidence with `if: always()`. Keep source/version provenance, native check logs
and statuses, browser reports, traces and relevant screenshots under the configured ignored artifact
root. Use unique artifact names carrying source/run identity and matrix dimensions. Exclude dependency
trees, caches, credentials and real user data. Set retention explicitly and preserve a project's
existing required retention when aligning workflows. Missing mandatory evidence is a failure;
diagnostics must not manufacture a successful check result.

For Worker workflows, the production artifact uses `worker-<source-sha>` and frontend evidence uses
`frontend-<run-id>-<run-attempt>`; add matrix dimensions when needed to avoid collisions. The common
frontend evidence retention is seven days. Preserve explicitly required longer retention and
project-specific cache/coverage settings. Other production runtimes adapt the artifact role name
without losing immutable source identity or conflating build output with evidence.

For hidden artifact directories, enable hidden-file inclusion only for the intended generated paths
and exclude sensitive files. Successful deployment artifacts are separate from failure diagnostics
and carry validated source/checksum metadata. [Artifact upload behavior](https://github.com/actions/upload-artifact).

Scope verification concurrency by workflow and PR/ref so unrelated work does not cancel each other.
Superseded PR verification may be canceled. Serialize production changes by the actual deployment
target and preserve the agreed treatment of an in-progress deployment; aligning names does not
authorize changing cancellation policy. Default GitHub concurrency can replace an older pending run,
and dispatch order is not guaranteed. If all pending deployments must be retained, explicitly choose
a supported queue policy. A stale revision must not overwrite a newer accepted deployment.
[GitHub concurrency behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

## Common Deploy boundary and sequence

The `Deploy` job uses `needs: verify` and the main-push condition, preserving project-owned permission,
environment and credential scopes. Never use an always-run deployment to bypass failed/skipped checks.
Keep common setup names (`Checkout the workflow commit`, `Setup pnpm`, `Setup Node.js`,
`Install dependencies`), then `Download the tested Worker`, `Verify deployment boundaries`,
`Deploy the tested Worker` and `Verify production deployment`. Use only the setup steps actually required
by that project's approved deployment path. An approved separate production build fits before Deploy
and replaces the artifact-download role only when its qualified production output is the real target.

The boundary verifies the source/result/artifact identity and the repository's existing target,
account and control-plane ownership guards. Those guard implementations, credentials and native deploy arguments
remain project-owned; the shared convention does not weaken them or expand access. Deploy the
qualified production output for the verified SHA, then retain the existing deployed-version and traffic
checks through the deployment provider's control plane. For Cloudflare, this means the existing
authorized control-plane checks, with their credential scopes preserved. Retain deployment evidence;
a local fixture or successful upload alone does not prove deployment.

GitHub Actions post-deployment acceptance must not request the public production site's HTTP pages,
routes or assets. Remove those probes and their solely owned scripts/documentation while preserving
other callers. Do not disable WAF, bypass challenges or change security settings to make a probe pass.
Local/CI browser and built-runtime tests, actual Google Fonts verification, build gates and actual
deployment remain required. Public package/source installation verification also remains separate
from protected production-site acceptance.

## Bounded local extensions and contribution validation

Keep the shared roles and order while documenting native script names, workspace paths, pinned CLI
source, runtime matrices, production build settings, services/fixtures, browser routes, coverage
thresholds, cache keys, retention, deployment targets and control-plane deployment checks in the owning repository.
Preserve stricter local gates, branch coverage and approved security/ownership guards. Differences
must describe a real native dependency or production requirement; they are not permission to remove
tests, relax standards, add business logic to tools or introduce cross-project deployment dispatch.

Before submitting, check YAML and Actions expressions, local script/profile wiring and changed native
gates. Verify the failure probe and actual artifact retention, action/toolchain compatibility and the
Verify → Deploy dependency/trigger boundary. Record exact source SHA, command outcomes and remaining
blocked checks in the PR. Exercise PR CI first; after owner merge verify the automatic main run and
its separate control-plane deployment results. Preserve owner merge, production and release authority.
