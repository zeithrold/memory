# Preferences and accessible localization

Define allowed values, defaults, storage key/version and normalization for each preference. Treat cookies/local storage as unknown input; unknown/stale values need deterministic supported defaults. Keep SSR and first-client rendering consistent before applying persistence at the intended lifecycle boundary. Test malformed storage, reload, navigation and supported changes.

Preserve selected theme/language and system behavior according to the contract. Treat reduced motion as an accessibility input. Keep variants and accessible names synchronized with preferences.

Translate the complete flow: labels, descriptions, relevant placeholders, validation/service errors, retry, dialogs, close controls and route error boundaries. Avoid fixed-English accessible labels in translated UI. Preserve interpolation, plurals and locale formatting through the existing mechanism.

Test long text, supported scripts/font fallback, locale formatting, themes, focus and reflow. Use deterministic normalization/SSR tests and browser tests for rendered behavior. Record exercised locales; a selector alone does not establish coverage.

## Instance and locale ownership

Inventory actual instances and provider scopes before changing localization. A second catalog is not
proof of a second runtime instance. The application creates one browser translation instance per mounted
root and injects it through an explicit adapter/provider; components and shared libraries never call a
hidden factory, register another engine or import a mutable default singleton. Keep provider/context/hook
modules in the same resolved React graph. Business dictionaries and engine selection remain consumer-owned.

FrontendProvider's validated preference locale is the single browser authority. Translation is derived
from that locale, including service errors, dialogs and portals; engines do not independently read/write
storage or overwrite it from their default language. The shared `createI18nAdapter` requires the host's
instance; `useI18n(adapter)` reads the existing provider and supplies locale on each call. Existing engines
can adapt their translate function using explicit namespace/language options without a global mutation.

Resolve locale once per SSR request from supported cookie/header rules. Give mutable server engines a
request-scoped lifecycle, initialize their resources before rendering, and inject the same resolved locale
into server translation and first client preferences. Never share a mutable server language singleton
across concurrent requests. Keep the browser instance stable across route/locale changes; no remount is
needed to translate a form, and its unsaved input must survive.

Split messages into explicit common/shell and feature namespaces. Type keys from a canonical source
catalog; prohibit arbitrary strings at component call sites. Validate all supported locale namespaces,
keys, nonempty values and interpolation placeholders in a native unit gate. Keep plurals, number/date
formatting and interpolation escaping with the injected engine. The generic adapter checks coverage and
forwards values; it does not replace a complete translation engine or own business copy.

Verify injection identity, namespace/key compile errors, coverage failures, separate server-request
engines, deterministic first paint and a real locale change while retaining input. Include translated
accessible names and recovery states in browser evidence; selected locale alone does not prove coverage.
