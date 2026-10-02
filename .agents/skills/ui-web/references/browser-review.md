# Browser interaction review

Use the existing Playwright server and projects. For a Cloudflare Worker target, include the built Worker path rather than claiming a dev-server test proves deployed behavior. Preserve framework-specific server exports and client boundaries.

Cover relevant initial, loading, empty, service failure, validation error, retry, successful write, dialog, disabled and preserved-input states. Scan after establishing each state. Document mocked API paths separately from real service coverage.

Use semantic native controls and translated accessible/error/dialog names. Test the actual keyboard path: skip link, visible focus, logical order, dismissal, focus restoration and reachable actions. Preserve native browser fallback and progressive enhancement where supported.

Full-page Axe scans cover page-level issues; targeted scans supplement them. Findings must fail the check. Explain reviewed exclusions in project-owned tests with a reason/follow-up rather than globally hiding failures. JSX a11y lint is disabled for ESLint 10 compatibility; browser accessibility work remains required. Axe covers only selected rules and the current DOM state.

Review narrow/wide viewports, large text, long translations, themes and reduced motion. Check hidden actions, clipping and unexpected overflow. Test deterministic preference hydration separately from appearance.

Capture screenshots as named attachments and retain failure traces/reports. Record browser, viewport, locale, theme, route and state in test names or metadata. Captures are review evidence; they are not maintained visual baselines or automatic design approval.
