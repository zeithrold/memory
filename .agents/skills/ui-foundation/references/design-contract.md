# Extract and apply a project design contract

Use existing design documents, rendered components, CSS tokens, variant definitions, fonts, screenshots and interaction tests as evidence. Record file paths and the source revision. Distinguish intended principles from accidental implementation defects. A missing destructive token or undefined CSS variable is a defect to resolve, not a shared design choice to copy.

| Area | Project-owned contract and evidence |
| --- | --- |
| Purpose | Primary tasks, hierarchy, supported users, real empty and recovery states |
| Tokens | Primitive values and semantic surface, text, border, focus, action, destructive and feedback roles; light/dark mappings |
| Typography | Noto Google Fonts/licensing, language coverage, configurable body/control/help roles (15/13/12px defaults), scale and fallback |
| Layout | Content widths, spacing, grids, responsive transitions and overflow |
| Components | Component owners, semantic variants, states, names and keyboard behavior |
| Preferences | Theme/language/motion ownership, allowed values, SSR defaults and persistence |
| Content | Translation ownership, long labels, formatting, dialog and route error copy |
| Evidence | Routes/states, browser/viewport/locale/theme, automation and remaining visual judgment |

Shared Skills describe how to make and verify decisions. Keep project values, brand, copy and business interactions local. Do not homogenize the products, introduce decorative sample data or replace their component foundation during extraction.

Apply semantic tokens to component variants; prefer the existing variant mechanism (for example CVA) over duplicated inline states. Color literals belong in token declarations. Include imported declaration sources when checking variables; runtime-provided names need exact documented exceptions. A static declaration inventory does not prove a variable is available in every scope/theme. Check the rendered result as well.

Cite affected decisions and inspect relevant interaction states. State how automated checks and human visual review support the result. Keep captured review evidence distinct from maintained screenshot baselines. The consumer owns any baseline approval and performance budgets. For reference-led visual refinement, follow [visual design review](visual-design.md).

Use semantic typography roles throughout forms and reading content. Shared defaults are body 15px,
controls 13px, help/metadata 12px and headings 19px, with a separate 17px reading role and 16px editable
input role. Role tokens remain configurable and headings retain an intentional hierarchy.
Consumers record justified token overrides in their own design contract; tools accepts configuration,
never selects values through a project name. Preserve minimum reachable control dimensions, text zoom,
long translation and narrow-layout behavior when choosing sizes.
