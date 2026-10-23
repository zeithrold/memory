'use client'

import { ArrowLeft } from 'lucide-react'
import { useMessages } from './i18n/use-messages'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

export function NotFoundContent(): React.JSX.Element {
  const t = useMessages()
  return (
    <section className={PAGE_CLASS} aria-labelledby="not-found-heading">
      <p className="text-help tracking-[.14em] font-semibold text-muted-foreground">404</p>
      <h1 id="not-found-heading">{t.notFoundTitle}</h1>
      <p className="max-w-[54ch] text-body leading-[1.8] text-muted-foreground">{t.notFoundDescription}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-control">
        <a className="inline-flex min-h-11 items-center gap-2 font-medium" href="/memories">
          <ArrowLeft size={16} aria-hidden="true" />
          {t.back}
        </a>
        <a className="inline-flex min-h-11 items-center" href="/errors">{t.browseApiErrors}</a>
      </div>
    </section>
  )
}
