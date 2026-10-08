export default {
  files: ['app/**/*.css', 'components/ui/ztd-me/**/*.css'],
  classFiles: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
  tokenFiles: ['node_modules/tailwindcss/theme.css'],
  // Radix Popper writes these exact variables on its content and trigger.
  externalCustomProperties: [
    // Vaul writes these translation values from snap points and pointer motion.
    '--initial-transform',
    '--snap-point-height',
    '--swipe-amount',
    '--radix-select-content-available-height',
    '--radix-dropdown-menu-content-transform-origin',
    '--radix-select-content-transform-origin',
    '--radix-select-trigger-width',
  ],
}
