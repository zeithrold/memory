'use client'

import type { ShellProps } from './shell-types.js'
import { AppearanceMenu } from './appearance.js'
import { useFrontendPreferences } from './context.js'
import { safeHref } from './href.js'
import { NativeLink } from './link.js'
import { LocaleSelect } from './locale-select.js'
import { shellMessages } from './messages.js'
import { cn } from './ui/cn.js'

const layout1Class = [
  'ztd-skip fixed start-2 top-2 z-200 -translate-y-[200%] bg-surface p-3 text-foreground',
  'focus:translate-y-0',
].join(' ')

const layout2Class = [
  'ztd-chrome mx-auto flex min-h-16 max-w-320 items-center justify-between gap-4 px-4 sm:px-6 lg:min-h-18',
  'lg:px-8',
].join(' ')

const layout3Class = [
  'ztd-brand inline-flex min-w-0 items-center gap-2 text-body leading-6 font-semibold text-foreground',
  'no-underline',
].join(' ')

export function Appbar(props: Omit<ShellProps, 'children' | 'footer'>): React.JSX.Element {
  const Link = props.linkComponent ?? NativeLink
  const { preferences } = useFrontendPreferences()
  const messages = shellMessages(preferences.locale)
  return (
    <>
      <a className={cn(layout1Class)} href={`#${props.mainId ?? 'ztd-main'}`}>{messages.skip}</a>
      <header className={cn(`ztd-appbar border-b border-border bg-background ${props.appbarClassName ?? ''}`)}>
        <div className={cn(`${layout2Class} ${props.chromeClassName ?? ''}`)}>
          <Link
            className={cn(`${layout3Class} ${props.brandClassName ?? ''}`)}
            href={safeHref(props.brand.homeHref)}
          >
            {props.brand.mark ?? null}
            <span className={cn('wrap-anywhere')}>{props.brand.label}</span>
          </Link>
          <div className={cn('ztd-actions flex shrink-0 items-center gap-2')}>
            {props.projectActions ?? null}
            <AppearanceMenu />
            <LocaleSelect />
            {props.identity ?? null}
          </div>
        </div>
      </header>
    </>
  )
}
