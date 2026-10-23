# Shared primitive integration

Use the installed source item's public client entry for primitives and its server-safe entry for
localization contracts. Preserve provider/context/hooks as one module graph. Review incoming source,
exact dependency pins, patches and licenses together; match the consumer's declared source aliases.
Do not add a project-name branch or relocate business navigation/messages into generic runtime.

Choose native form controls when their behavior fits. Enhanced select, checkbox, disclosures, tabs,
modal/sheet and tooltip behavior belongs to the reviewed Radix primitives, including keyboard and focus
state. Supply modal Title/Description and localized reachable close actions. Keep asynchronous
confirmation/state ownership in the consumer; do not remount forms or manually copy focus management.

For third-party scrollbars use a bounded native ScrollArea viewport, passing the existing style nonce
and respecting portal/fullscreen context. Verify actual height, scroll range and keyboard/wheel input.
Do not implement scrolling with transforms or global wheel interception. Simple page scrolling can use
native overflow. Prefer semantic body/control/help typography roles from the project's design contract,
with consumer-owned token overrides, rather than reducing an entire form to supporting-text size.

The host explicitly constructs/injects its translation instance and owns business resources. Library
factories adapt that instance; they never create another engine or persist another locale authority.
Browser translation derives from existing preference locale. Server engines with mutable state are
request-scoped; namespaces and typed keys must match across supported locales. See
[preferences and localization](preferences-i18n.md) for lifecycle and coverage requirements.

Keep local source/packed candidate evidence distinct from approved public-source acceptance. Preserve
the existing owner review/full SHA/fresh public-install boundary and record actual native gates.
