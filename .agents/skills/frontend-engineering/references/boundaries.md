# Engineering boundaries

Keep route orchestration, business rules, unknown-input validation, data access and presentation explicit. Follow current dependency direction and state ownership. A shared Skill is not authority to introduce an application framework or unify unrelated product domains.

Use runtime schemas (for example existing Zod schemas) at actual untrusted boundaries. TypeScript does not validate HTTP responses, stored preferences or Worker inputs. Keep contracts with their owners. Shared schemas can remove proven duplication; duplicated contracts alone do not justify a broad rewrite.

Classify server-only, client-only and shared modules. Avoid browser globals during SSR; normalize persisted values and keep the first client tree consistent. Use framework-supported exports/directives. For vinext App Router select the explicit @ztd-me/eslint profile; ordinary components and client routes retain Fast Refresh boundaries. Framework builds own route and metadata validation.

Distinguish asynchronous loading, missing data, validation/service failure and success. Preserve input and recovery. Handle stale requests using the existing model. Document mutation intent and authorization assumptions without moving backend responsibilities into presentation.

Keep semantic variants with components and semantic roles with tokens. Preserve local font loading and language fallback. Use native links/buttons/forms/dialogs and supported fallback paths.

Pin pnpm and retain release-age, trust and dependency-build policies. Do not broaden exceptions or force unsupported dependency majors. Separate dev-server evidence, built-Worker tests and main-only deployment verification; none proves the others.
