'use client'

import type { ApplicationShellProps, ShellProps } from './shell-types.js'
import { Appbar } from './appbar.js'
import { SiteFooter } from './footer.js'
import { cn } from './ui/cn.js'

export function PublicShell(props: ShellProps): React.JSX.Element {
  return (
    <div className={cn(`ztd-frontend flex min-h-dvh flex-col ${props.className ?? ''}`)}>
      <Appbar {...props} />
      <main
        className={cn(`min-w-0 flex-1 ${props.mainClassName ?? ''}`)}
        id={props.mainId ?? 'ztd-main'}
        tabIndex={-1}
      >
        {props.children}
      </main>
      {props.footer === undefined ? null : <SiteFooter {...props.footer} />}
    </div>
  )
}
export function ApplicationShell(props: ApplicationShellProps): React.JSX.Element {
  return (
    <div className={cn(`ztd-frontend ztd-application flex min-h-dvh flex-col ${props.className ?? ''}`)}>
      <Appbar {...props} appbarClassName={`sticky top-0 z-30 ${props.appbarClassName ?? ''}`} />
      {props.businessNavigation ?? null}
      {props.serviceNotice ?? null}
      <div className={cn('ztd-workspace flex flex-1')}>
        {props.contextSidebar ?? null}
        <main
          className={cn(`min-w-0 flex-1 ${props.mainClassName ?? ''}`)}
          id={props.mainId ?? 'ztd-main'}
          tabIndex={-1}
        >
          {props.children}
        </main>
      </div>
      {props.footer === undefined ? null : <SiteFooter {...props.footer} />}
    </div>
  )
}
