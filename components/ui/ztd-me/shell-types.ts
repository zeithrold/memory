import type { ComponentProps, ComponentType, ReactNode } from 'react'

export type Brand = {
  label: string
  homeHref: string
  mark?: ReactNode
}
export type LinkProps = Omit<ComponentProps<'a'>, 'href' | 'children'> & {
  href: string
  children: ReactNode
}
export type LinkComponent = ComponentType<LinkProps>
export type FooterLink = {
  label: string
  href: string
  ariaLabel?: string
}
export type SiteFooterProps = {
  copyright?: ReactNode
  links?: readonly FooterLink[]
}
export type ShellProps = {
  className?: string
  appbarClassName?: string
  chromeClassName?: string
  brandClassName?: string
  mainClassName?: string
  brand: Brand
  footer?: SiteFooterProps
  children: ReactNode
  projectActions?: ReactNode
  identity?: ReactNode
  mainId?: string
  linkComponent?: LinkComponent
}
export type ApplicationShellProps = {
  businessNavigation?: ReactNode
  contextSidebar?: ReactNode
  serviceNotice?: ReactNode
} & ShellProps
