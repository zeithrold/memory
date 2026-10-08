# Third-party notices for source delivery

The delivered self-owned source is MIT licensed; see `LICENSE`. This does not relicense dependencies.

- UI composition follows shadcn/ui's new-york Radix foundation (MIT, copyright shadcn). Its license is
  delivered in `third-party/SHADCN-MIT.txt` alongside this notice.
- Radix primitives, Lucide React and other installed dependencies retain their upstream licenses and
  notices. Preserve those notices when distributing the consumer application.
- The Select 2.3.7 declaration patch includes Radix source context (MIT, copyright 2022 WorkOS).
  Its original notice is delivered in `third-party/RADIX-MIT.txt` and must accompany the patch.
- The transitive `react-remove-scroll-bar@2.3.8` npm artifact declares MIT but omits its full notice.
  Its original upstream Anton Korzunov notice is preserved in `third-party/REACT-REMOVE-SCROLL-BAR-MIT.txt`.
  Source: [upstream LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/7301c160fda44cb8cf2b9fdfde61efad35736196/LICENSE).
- The stylesheet loads Noto Sans, Noto Sans SC/JP/KR and Noto Color Emoji directly through the Google
  Fonts API. These fonts retain SIL Open Font License 1.1. Their complete copyright and license notices
  are delivered as `third-party/NOTO-*-OFL.txt`, including the Color Emoji notice. The earlier monochrome
  notice is retained too, for six complete notices. No font binaries are redistributed in the item.

Sources: [shadcn/ui](https://github.com/shadcn-ui/ui), [Noto Sans](https://github.com/notofonts/latin-greek-cyrillic),
[Noto CJK](https://github.com/notofonts/noto-cjk), and [Noto Emoji](https://github.com/googlefonts/noto-emoji).

The primitive foundation also preserves Radix's MIT notice (`third-party/RADIX-MIT.txt`, copyright 2022 WorkOS).
Individual Radix packages remain separately installed dependencies; preserve their upstream notices.

## Tailwind component foundation

Tailwind CSS and tailwind-merge are MIT licensed. The source item requires Tailwind CSS 4.3.3
compilation and pins tailwind-merge 3.7.0. Vaul 1.1.2 (MIT, Emil Kowalski) supplies Drawer gestures;
VAUL-MIT.txt retains its notice. The included exact patch removes runtime stylesheet injection only;
reviewed static behavioral CSS retains the native presence, drag and snap-point selectors under
components layer. It fixes the upstream invalid hitarea selector, removes a duplicate selector and
uses semantic handle color and scoped keyframe names. No CSP policy is weakened.

Noto Serif, Noto Serif SC, Noto Serif JP and Noto Serif KR are opt-in Google Fonts families, each with
its upstream SIL OFL 1.1 notice retained. UI defaults remain Noto Sans with CJK and Color Emoji.
