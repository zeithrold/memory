'use client'

import type { ApplicationShellProps, ShellProps } from './shell-types.js'
import { Appbar } from './appbar.js'
import { SiteFooter } from './footer.js'

export function PublicShell(props: ShellProps): React.JSX.Element {
  return (
    <div className="ztd-frontend">
      <Appbar {...props} />
      <main id={props.mainId ?? 'ztd-main'} tabIndex={-1}>{props.children}</main>
      {props.footer === undefined ? null : <SiteFooter {...props.footer} />}
    </div>
  )
}
export function ApplicationShell(props: ApplicationShellProps): React.JSX.Element {
  return (
    <div className="ztd-frontend ztd-application">
      <Appbar {...props} />
      {props.businessNavigation ?? null}
      {props.serviceNotice ?? null}
      <div className="ztd-workspace">
        {props.contextSidebar ?? null}
        <main id={props.mainId ?? 'ztd-main'} tabIndex={-1}>{props.children}</main>
      </div>
      {props.footer === undefined ? null : <SiteFooter {...props.footer} />}
    </div>
  )
}
