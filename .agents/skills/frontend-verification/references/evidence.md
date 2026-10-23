# Evidence requirements

| Gate | Useful proof | Boundary |
| --- | --- | --- |
| ESLint | Exact package/config, files, zero-error exit | Separate compiler/build/browser gates; JSX a11y suite disabled |
| CSS | Native findings, declaration sources, undefined references/literal colors | Static inventory cannot prove cascade/theme/runtime tokens |
| Types | Compiler command/project/result | Unknown runtime data still requires validation |
| Unit/integration | Report/scope and real/mock preconditions | Not rendered browser behavior |
| Build | Native framework build and built-Worker path | Not deployment or interaction proof |
| Browser | Route/state/locale/theme/viewport, keyboard and Axe results | Selected states/rules, not full accessibility certification |
| Capture | Named PNG attachments and traces | Human visual judgment remains; no baseline comparison |
| Deployment | Main-only workflow plus control-plane deployed-version/traffic evidence | Separate authorized action; no public production-site HTTP/page/asset acceptance probes |

Retain the configured artifact root through an always-run CI upload. Check reports include argv, statuses, timing, exits and collected paths. Native attachments/reports must be under that root or explicitly collected. Preserve versions/revision alongside results. Keep credentials and real user data out of fixtures/artifacts.

Keep existing authorized deployment-provider control-plane checks and their credential scopes. Public
production page/route/asset probes are excluded from GitHub Actions deployment acceptance. Local/CI
browser and built-runtime tests, Google Fonts verification, builds and actual deployment stay intact;
public package/source installation verification is a separate gate. Do not change WAF or security
settings to work around a production-site challenge.

Project-owned coverage includes affected controls/recovery, dialog names/dismissal/focus restoration, skip links, meaningful keyboard paths, translations, themes and motion/reflow. Label mocked HTTP interactions. Use synthetic automated fixtures; avoid fabricated production content solely for captures.
