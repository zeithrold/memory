# Preferences and accessible localization

Define allowed values, defaults, storage key/version and normalization for each preference. Treat cookies/local storage as unknown input; unknown/stale values need deterministic supported defaults. Keep SSR and first-client rendering consistent before applying persistence at the intended lifecycle boundary. Test malformed storage, reload, navigation and supported changes.

Preserve selected theme/language and system behavior according to the contract. Treat reduced motion as an accessibility input. Keep variants and accessible names synchronized with preferences.

Translate the complete flow: labels, descriptions, relevant placeholders, validation/service errors, retry, dialogs, close controls and route error boundaries. Avoid fixed-English accessible labels in translated UI. Preserve interpolation, plurals and locale formatting through the existing mechanism.

Test long text, supported scripts/font fallback, locale formatting, themes, focus and reflow. Use deterministic normalization/SSR tests and browser tests for rendered behavior. Record exercised locales; a selector alone does not establish coverage.
