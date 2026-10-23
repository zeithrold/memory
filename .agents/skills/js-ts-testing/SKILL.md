---
name: js-ts-testing
description: Verify JavaScript and TypeScript projects through their declared package scripts, type checks, unit tests, and browser tests.
license: MIT
---

# JavaScript and TypeScript testing

Read the project's `AGENTS.md`, package manifest, lockfile, and `zt.json` before running commands.

1. Use `zt inspect --json` to find declared scripts. Confirm the package manager from the project's lockfile and `packageManager` field.
2. Run the narrowest relevant lint, typecheck, and test scripts. A script name is an entry point, not proof of what its underlying command covers; inspect it when the distinction matters.
3. Separate unit tests from browser or end-to-end tests. Record required browsers, services, and credentials as preconditions; report unavailable infrastructure as blocked.
4. Verify affected UI states and failure recovery with appropriate tests and captures. Do not claim visual approval from a screenshot diff or passing DOM assertion alone.

Report exact commands, results, and unrun checks. Keep project-specific framework and deployment steps in the project.

For frontend aggregate gates, use frontend-verification and an explicit zt check profile. Include CSS and build checks, retain browser reports/attachments, and preserve required failures. A successful aggregate exit does not establish untested routes or states.
