---
name: ui-web
description: Apply shared UI principles to browser interfaces using semantic HTML, responsive CSS, and browser accessibility evidence.
---

# Web UI review

Read the project's design contract and `ui-foundation` first. Prefer native semantic controls and explicit labels. Check keyboard operation, focus visibility and order, error association, and live feedback. Verify reflow and content preservation at narrow widths and enlarged text. Test the actual supported browsers and assistive technology paths when the change requires them.

Use the framework's native testing and lint tools. Automated accessibility checks are useful evidence, but they do not replace checking rendered content, interaction states, and recovery in the browser. Keep framework APIs and project component choices in local guidance.

Follow [browser review](references/browser-review.md) for route/state, translated labels, keyboard and Axe coverage, built-Worker evidence and retained captures. Use frontend-engineering for deterministic hydration and frontend-verification for executable gates.
