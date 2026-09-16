import type { Metadata } from 'next'
import type { CatalogEntry } from '@/lib/error-catalog'
import { notFound } from 'next/navigation'
import { ERROR_BY_SLUG } from '@/lib/error-catalog'

interface PageProps {
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
      ? { fields: [{ path: ['content'], message: 'Too big: expected string to have <=6000 characters' }] }
      : {}),
  }
}
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const entry = ERROR_BY_SLUG.get(slug)
  if (entry === undefined)
    return { title: 'Unknown error — Shared Memory' }
  return {
    title: `${entry.status} ${entry.title} — Shared Memory`,
    description: entry.summary,
  }
}
export default async function ErrorDetail({ params }: PageProps) {
  const { slug } = await params
  const entry = ERROR_BY_SLUG.get(slug)
  if (entry === undefined)
    notFound()
  return (
    <main className="page">
      <p className="eyebrow">
        {entry.status}
        {' · '}
        {entry.retryable ? 'Retryable' : 'Not retryable without a change'}
      </p>
      <h1>{entry.title}</h1>
      <p className="section-heading">
        <code>{entry.code}</code>
      </p>
      <p className="muted">{entry.summary}</p>
      <section className="connection-card">
        <h2>What to do</h2>
        <ul>
          {entry.remediation.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
      <section className="connection-card">
        <h2>Example response</h2>
        <pre>{JSON.stringify(exampleFor(entry), null, 2)}</pre>
      </section>
      <p className="muted">
        <a href="/errors">← All API errors</a>
      </p>
    </main>
  )
}
