---
name: ui-web
description: Apply shared UI principles to browser interfaces using semantic HTML, responsive CSS, and browser accessibility evidence.
license: MIT
---

# Web UI review

Read the project's design contract and `ui-foundation` first. Prefer native semantic controls and explicit labels. Check keyboard operation, focus visibility and order, error association, and live feedback. Verify reflow and content preservation at narrow widths and enlarged text. Test the actual supported browsers and assistive technology paths when the change requires them.

Use the framework's native testing and lint tools. Automated accessibility checks are useful evidence, but they do not replace checking rendered content, interaction states, and recovery in the browser. Keep framework APIs and project component choices in local guidance.

Follow [browser review](references/browser-review.md) for route/state, translated labels, keyboard and Axe coverage, built-Worker evidence and retained captures. Use frontend-engineering for deterministic hydration and frontend-verification for executable gates.

For styled scrollbars, use the installed Radix `ScrollArea` (or a reviewed equivalent) and retain native
wheel, touch and keyboard scrolling. Simple document content can keep native CSS overflow. Define an
actual bounded container height and verify the viewport's rendered size/scroll range; do not replace
scrollTop with transforms, intercept wheel events globally or build a JavaScript scrollbar. Forward the
same provider nonce and portal container to primitives, including fullscreen contexts. Modal/sheet
content needs a title, description and an explicitly localized reachable close control. Verify focus
trapping/restoration, Escape, nested overlays, native scrolling and narrow reflow in the real browser.
