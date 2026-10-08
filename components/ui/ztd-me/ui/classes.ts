export const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
export const disabledClass = 'disabled:cursor-not-allowed disabled:opacity-55'
export const fieldClass = [
  'w-full min-w-0 min-h-11 rounded-lg border border-border bg-surface px-3 py-2',
  'font-sans font-normal text-control text-foreground placeholder:text-muted-foreground placeholder:opacity-100',
  'aria-invalid:border-destructive',
  focusClass,
  disabledClass,
].join(' ')
export const overlayClass = 'ztd-modal-overlay fixed inset-0 z-110 bg-backdrop'
export const panelClass = [
  'ztd-overlay grid content-start gap-6 overflow-y-auto border border-border bg-surface',
  'p-6 font-sans text-body text-foreground',
].join(' ')
export const titleClass = 'm-0 text-heading leading-[1.35] font-semibold'
export const helpClass = 'ztd-help m-0 font-sans text-help text-muted-foreground'
export const headerClass = 'grid gap-2'
export const footerClass = 'flex flex-wrap items-center justify-end gap-3'
export const menuClass = [
  'ztd-overlay ztd-menu z-100 max-h-[calc(100dvh-24px)] overflow-y-auto rounded-xl',
  'border border-border bg-surface p-1.5 font-sans text-control text-foreground shadow-menu',
].join(' ')
export const menuItemClass = [
  'ztd-menu-item relative flex min-h-9 items-center gap-2 rounded-lg py-2 ps-3 pe-8',
  'cursor-default select-none pointer-coarse:min-h-11 data-highlighted:bg-muted',
  'data-highlighted:outline-none',
].join(' ')
export const indicatorClass = [
  'ztd-indicator absolute end-3 start-auto top-1/2 flex size-4 -translate-y-1/2 items-center',
].join(' ')
