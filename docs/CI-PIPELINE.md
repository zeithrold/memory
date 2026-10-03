# Shared verification and deployment pipeline

This focused follow-up depends on source migration
[PR #5](https://github.com/zeithrold/memory/pull/5), based on
`babe291b75cd175a43b10cddc05ae72ed237199b`. The compared Memory main revision is
`7556a7546a42b2bee8ffdf14bfa1629c122bb891`. Source/font gates from the migration
branch remain required. The common reference is website
[`d98f3a4`'s pipeline contract](https://github.com/zeithrold/website/blob/d98f3a4a6d35988b8e7d9ca7f8b37615e6531b35/docs/ci-pipeline.md).

`CI & Deploy` has `Verify` followed by `Deploy`. Verify checks out the workflow
commit with persisted credentials disabled, sets up pnpm and Node 24, installs the
frozen dependencies, sets up Go 1.27.1, installs the reviewed zt CLI, records source/
lock/toolchain provenance, installs Chromium and runs `pnpm check`. Failed native
logs are printed without changing their result. Verified build and frontend
evidence uploads follow the common order.

All action references are immutable and match the common reference; Memory's extra
Chromium cache action is also pinned. zt remains at
`3f9a3a7d33befc5a954ba1e86d3aa6d72e2c762f`. Go 1.27.1 was actually installed and
compiled this CLI in the source migration's exact-head CI. The new common Go action
is validated again by this follow-up's CI.

The explicit native profile has eight required gates: lint, CSS, types, unit,
unsigned Worker build, unsigned browsers, configured-session browsers/Axe, and
integration. The final integration gate runs the deliberate failure-evidence probe.
It must retain exactly the expected Axe failure, complete scan, reports, trace,
screenshot and video, then exit successfully. Any additional failure or missing
artifact fails the required native profile. No test or business assertion is removed.

Memory keeps all branch pushes and PRs, versioned Chromium caching, 14-day artifacts
and independent actual Google Fonts checks. Those extra checks preserve UI source
receipts, consumer/merge heads, glyphs, weights, complete emoji, cold/warm byte caps,
keyboard, motion and Axe evidence. Cloud-only font preview remains prohibited in CI.
GitHub token grants, secrets and Worker/Access credential scopes are unchanged.

## Memory's production artifact boundary

The verified build artifact is `worker-verification-${github.sha}` because it is an
unsigned browser-test build for review. Its metadata explicitly labels it
`unsigned-verification`. The frontend evidence artifact uses the common
`frontend-${github.run_id}-${github.run_attempt}` name. Both retain 14 days.

Deploy requires successful Verify and exactly
`github.event_name == 'push' && github.ref == 'refs/heads/main'`. It checks out that
same workflow commit and downloads the review artifact into `.zt/verified-build`,
outside production `dist`. Boundary checks reject branch/PR events, a dirty source,
missing/wrong artifact purpose, a revision mismatch and a lockfile mismatch, then
verify the unchanged UI source receipt. Regression tests cover those rejections.

The existing `pnpm deploy` command performs target/auth checks and a fresh build
with the existing production Access/Sentry settings, verifies Workflow exports and
uploads that production Worker. The downloaded preview files never enter production
`dist`; neither the unsigned nor synthetic-session fixture can become the deployed
artifact. Secrets are confined to the existing production command. No new grants,
production environment controls, manual triggers or enabling parameters are added.

Memory's post-deploy hook checks the production bundle's Workflow export contract.
It does not claim to verify live authenticated HTML, an active remote version,
Cloudflare Access sign-in or remote bindings. Adding those checks would require a
separate project-specific acceptance design. This alignment does not add credentials
or turn browser fixtures into production acceptance evidence.

Both PRs remain drafts for owner review. This follow-up should merge after PR #5;
retarget its base to main once the source migration has merged. No merge or manual
deployment is performed during validation.
