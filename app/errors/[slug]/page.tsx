import type { Metadata } from 'next'
import type { CatalogEntry } from '@/lib/error-catalog'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { ERROR_BY_SLUG } from '@/lib/error-catalog'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const EYEBROW_CLASS = ['eyebrow text-help tracking-[2px] uppercase text-primary font-[650]'].join(' ')

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

const SECTION_HEADING_CLASS = ['section-heading flex justify-between gap-4 items-center mb-5 [&_h2]:m-0'].join(' ')

const CONNECTION_CARD_CLASS = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

const CONNECTION_CARD_CLASS_1 = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

type PageProps = {
  params: Promise<{ slug: string }>
}
function exampleFor(entry: CatalogEntry): Record<string, unknown> {
  return {
    type: `https://memory.ztd.me/errors/${entry.slug}`,
    title: entry.title,
    status: entry.status,
    detail: 'A concrete description of what failed in this request.',
    instance: '/api/v1/memories',
    code: entry.code,
    ...(entry.code === 'INVALID_INPUT'
      ? { fields: [
          { path: ['content'], message: 'Too big: expected string to have <=6000 characters' },
        ] }
      : {}),
  }
}
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const entry = ERROR_BY_SLUG.get(slug)
  if (entry === undefined) {
    return { title: 'Unknown error — Shared Memory' }
  }
  return {
    title: `${entry.status} ${entry.title} — Shared Memory`,
    description: entry.summary,
  }
}
export default async function ErrorDetail({ params }: PageProps): Promise<React.JSX.Element> {
  const { slug } = await params
  const entry = ERROR_BY_SLUG.get(slug)
  if (entry === undefined) {
    notFound()
  }
  return (
    <div className={PAGE_CLASS}>
      <p className={EYEBROW_CLASS}>
        {entry.status}
        {' · '}
        {entry.retryable ? 'Retryable' : 'Not retryable without a change'}
      </p>
      <h1>{entry.title}</h1>
      <p className={SECTION_HEADING_CLASS}>
        <code>{entry.code}</code>
      </p>
      <p className={MUTED_CLASS}>{entry.summary}</p>
      <section className={CONNECTION_CARD_CLASS}>
        <h2>What to do</h2>
        <ul>
          {entry.remediation.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
      <section className={CONNECTION_CARD_CLASS_1}>
        <h2>Example response</h2>
        <pre tabIndex={0} role="region" aria-label="Example response">
          {JSON.stringify(exampleFor(entry), null, 2)}
        </pre>
      </section>
      <p className={MUTED_CLASS_1}>
        <a className="inline-flex items-center gap-2" href="/errors">
          <ArrowLeft size={16} aria-hidden="true" />
          All API errors
        </a>
      </p>
    </div>
  )
}
