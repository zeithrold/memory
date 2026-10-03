export default {
  files: ['app/**/*.css', 'components/ui/ztd-me/**/*.css'],
  tokenFiles: ['node_modules/tailwindcss/theme.css'],
  // Radix Popper writes these exact variables on its content and trigger.
  externalCustomProperties: [
    '--radix-dropdown-menu-content-transform-origin',
    '--radix-select-content-transform-origin',
    '--radix-select-trigger-width',
  ],
}
