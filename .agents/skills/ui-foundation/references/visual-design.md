# Review a visual design against references

Use this workflow for requested visual refinement and named design benchmarks. Read the consumer's design contract first. Its audience, brand, supported languages, font policy, real tasks and explicit size preferences constrain the composition. Reusable guidance belongs here; product copy, exact scales, palettes, diagrams, API states and production policies stay in the consumer.

## Establish the comparison

Inspect the current rendered route and meaningful states before editing. For named awards, verify the actual award, year and winning entry through its official source; a nominee or gallery listing is not a winner. Visit the reference itself when available. Record unavailable or materially changed references. Extract relevant compositional or interaction principles rather than copying their branding, assets or page structure.

Set a local role budget for display, section headings, body, reading, controls, metadata and inputs. Use the shared typography roles for ordinary UI, and document justified consumer overrides. Distinguish a functional numeric display from a page title. Establish hierarchy through alignment, weight, line length and spacing within that budget. Avoid enlarging every role when the goal is visual quality.

## Eight dimensions

| Dimension | Compare and inspect | Repair and evidence |
| --- | --- | --- |
| Typography | Computed size, weight, line height, tracking and actual rendered glyph font for each role; long translated titles and reading measure | Reconcile role overrides, optical alignment and line breaks. Verify web fonts and fallback separately; a family declaration or `document.fonts.check` alone does not prove that font rendered. |
| Whitespace | Shared alignment edges, section rhythm, grouping and the distance between labels, content and actions | Remove accidental gaps and competing containers. Judge full-page rhythm alongside individual viewports. |
| Visual hierarchy | Entry point, reading order, primary action, task status, metadata and recovery | Give each region a clear purpose and visual weight. Preserve real empty, loading, populated, error and disabled states. |
| Color | Surface/text/action/border/focus roles in every supported palette and mode | Use semantic tokens. Check text contrast on actual composited backgrounds and recognizable focus/selected states. Color supports meaning without being its only carrier. |
| Motion | Entry, state change, navigation and interruption; content before hydration | Tie movement to a transition or meaningful data. Keep necessary content visible, avoid continuous decorative work, and verify reduced motion with the same actions reachable. |
| Micro-interaction | Hover, focus-visible, active, disabled, feedback, dismissal and return focus | Use native semantics and complete interaction paths. Smaller type must preserve reachable control dimensions. Pointer and keyboard affordances should express the same action. |
| Responsive | Narrow, intermediate and wide widths; translation, text enlargement, browser differences and real data extremes | Recompose at content-driven breakpoints. Check clipping, wrapping, reading order and action reachability, beyond document-level overflow. |
| Originality | A recognisable idea grounded in the subject and content | Develop a meaningful illustration, composition or interaction. Keep fictional counters, testimonials, outcomes and decorative sample data out of real product states. |

## Iterate from rendered evidence

Capture a representative initial frame, a complete page and the interaction states affected by the change. Choose a risk-based environment matrix: narrow and wide layouts, at least one intermediate breakpoint, supported locales, light/dark palettes, reduced motion, enlarged text and relevant browsers. Check edge widths around a breakpoint when the layout changes there. Keep screenshots, measurements, videos and reports in the consumer's ignored artifacts location.

When an SSR browser fixture injects a font specimen or other test-only content into framework-owned markup, first confirm a real interaction round trip and restored focus. Enabled static controls and loaded fonts do not prove client hydration. Retain page-error assertions and use a controlled startup delay when investigating timing.

Inspect each capture visually. Automated overflow checks do not catch optical imbalance, inappropriate line breaks, bad cropping or weak hierarchy. Conversely, a pleasing frame does not prove keyboard behavior, font delivery or a successful mutation. Use the consumer's native lint, CSS, type, unit and browser gates without weakening them.

For each observed gap, make a specific repair and repeat the affected check. Keep successful unaffected evidence; repeat broader checks when the change or a failure justifies it. Finish the review when the agreed scope has no known unresolved defect in the inspected states. Report untested states and remaining visual judgment explicitly. Self-review cannot establish an award win or a universal absence of possible improvements.

## Source, build and live delivery

Record which evidence applies to source inspection, a dev server, a production build or the live deployment. When asked about a live discrepancy, measure the actual live role values and loaded assets, then compare them with the relevant branch, main commit and deployment receipt. An adjustment on a feature branch or a green PR check does not establish live delivery.

Preserve the consumer's publication authorization and release path. Local/CI browser checks and production control-plane verification remain distinct. This workflow does not add public production acceptance probes to CI, change security controls, approve baselines, merge pull requests or authorize deployment.
