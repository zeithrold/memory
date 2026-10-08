# Noto typography through Google Fonts

The source UI uses the Google Fonts CSS2 API directly. `styles/fonts.css` imports Noto Sans and
Noto Sans SC/JP/KR as a variable weight range from 400 through 700, plus **Noto Color Emoji** at its native weight 400.
The owner selected color for all emoji. There is no monochrome-first fallback, bundled font binary or
Fontsource dependency. The emoji token and ordinary Latin/CJK stacks use the same color family.

The complete default and public-install gates verify actual remote browser delivery, including six
composed Noto Color Emoji samples rendered as single custom-font glyphs. Local preview evidence does
not replace those gates. See [verification](https://github.com/zeithrold/tools/blob/main/packages/ui/docs/verification.md) for commands, evidence and limitations.

Noto Sans handles English and Latin text. Simplified Chinese uses Noto Sans SC. Elements marked
`lang="ja"` or `lang="ko"` prioritize the matching CJK family for regional glyph forms. Set the
correct language on content and portals; changing the shared UI locale does not translate business
content. The shared controls still support English and Simplified Chinese, independently of the font
coverage. Consumers adding other languages should verify the appropriate Noto variant and its license.

Noto Serif and its appropriate CJK variants are permitted for content that benefits from serif
typography. The ordinary UI does not load unused Serif families. Add an explicit Google Fonts API
request by importing delivered `styles/fonts-serif.css`, then apply `font-serif` (or `.ztd-prose`)
to reading content. `--ztd-font-serif` supplies the semantic stack, with matching CJK language forms.

`--ztd-font-sans` and `--ztd-font-emoji` are the delivered font tokens. Latin and CJK precede emoji in the
ordinary text stack, preserving normal digits and text symbols. Use `.ztd-emoji` for an explicitly composed emoji
sequence. Meaningful emoji need a text equivalent or accessible label; decorative emoji are hidden
from assistive technology. `font-synthesis: none` prevents fabricated weights. Symbols and icons are
not substituted with platform emoji as part of this design.

## Network, performance and CSP

The browser requests CSS from `https://fonts.googleapis.com` and font subsets from
`https://fonts.gstatic.com`. This is a third-party network dependency: those services receive normal
request information, including the client IP address and request headers. Account for these requests
in the consumer's own privacy policy and deployment review. See the
[Google Fonts privacy FAQ](https://developers.google.com/fonts/faq/privacy).

The API supplies browser-appropriate, Unicode-ranged subsets. The browser downloads the subsets used
by rendered glyphs and weights, rather than every declared CJK subset. The request specifies required
weights and `display=swap`; native fallback keeps text readable during loading or an outage. No local
font hosting is silently substituted. A failed request means the intended Noto rendering is unverified.
For an optional consumer optimization, preconnect to the two origins in its existing document head
(with `crossorigin` for gstatic). Do not send dynamic/private page text in a `text=` API query.
See the [CSS2 API](https://developers.google.com/fonts/docs/css2) for supported request syntax.

Merge these origins into the consumer's existing CSP, preserving its script and nonce policy:

```text
style-src-elem ... https://fonts.googleapis.com;
font-src ... https://fonts.gstatic.com;
```

If the policy uses `style-src` without `style-src-elem`, include the API origin in that directive.
The synthetic verification server also permits Radix style attributes and nonce-bearing style
elements, as required by the existing primitives. The registry does not rewrite application CSP.
Test the real production headers, network availability and browser font usage before acceptance.

The source SHA, API query and dependency lock are pinned. Google controls the returned CSS and font
files and may update them; remote font bytes are not made immutable by the source pin. Browser checks
record actual font identities and resource transfers. The owner-approved representative fixture caps
include both font files and Google API CSS: **500,000 bytes for the English initial page**, **1,000,000
bytes for the Chinese initial page**, and **10,000 bytes for each immediate warm reload**. Cold pages
start in separate fresh browser contexts; warm pages use an ordinary reload in the same context with
the browser's default cache enabled. These are fixture budgets, not universal consumer page limits.
MB means 1,000,000 bytes and KB means 1,000 bytes. Chromium measures encoded HTTP response bytes,
including headers and payload, excluding socket/TLS framing and application HTML/JS/CSS/images.
HTTP-decoded body sizes are reported separately; warm body sizes refer to the previous cold response
and do not represent additional network traffic. API URLs need not end in a font file extension.

The full multilingual/emoji specimen retains actual glyphs, loaded weights, complete composed sequences,
CSP, accessibility, transfer reporting and the guard of fewer than 80 font requests. It has no ordinary
page byte cap: its deliberate multi-language coverage is not normal appbar usage. This replaces the
earlier blanket 2,000,000-byte font-only assertion with the separately approved representative budgets.
The authorized local preview reports transfers but cannot verify these remote budgets because its
compression/cache headers differ. Default CI and public source acceptance require the actual API.

## Licensing and evidence

The five loaded Noto families use SIL Open Font License 1.1. Complete copyright/license notices are
delivered in `third-party/NOTO-*-OFL.txt`, including `NOTO-COLOR-EMOJI-OFL.txt`. The earlier monochrome
notice is also retained; preserve these six notices with the source. Fonts are served by Google, rather than
redistributed as registry or npm assets. The shadcn MIT notice remains separate and intact.

The browser specimen checks real rendered font usage through Chromium's
[CSS.getPlatformFontsForNode](https://chromedevtools.github.io/devtools-protocol/tot/CSS/#method-getPlatformFontsForNode),
not just `font-family` or `document.fonts.check`. It exercises English, Chinese, Japanese, Korean,
weight 600 (loaded faces, distinct Latin weight metrics and no synthesis), mixed text and emoji,
VS16, skin tone, ZWJ family/technologist/rainbow flag and a regional
flag. A composed emoji must render as one custom Noto Color Emoji glyph. Axe and captures cover the specimen.
This does not certify every Unicode sequence, browser, screen reader or network region.
