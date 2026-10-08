import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { ERROR_BY_STATUS } from '@/lib/error-catalog'

const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_2 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const EYEBROW_CLASS = ['eyebrow text-help tracking-[2px] uppercase text-primary font-[650]'].join(' ')

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

const CONNECTION_CARD_CLASS = [
  'connection-card border border-border rounded-[12px] bg-card p-6 mb-6 [&_>_h2]:mt-0 [&_>_h2]:mx-0',
  '[&_>_h2]:mb-5 [&_>_:last-child]:mb-0 [&_p]:text-body [&_p]:text-muted-foreground [&_p]:leading-[1.8]',
  '[&_>_code]:text-control [&_>_code]:wrap-anywhere',
].join(' ')

export const metadata: Metadata = {
  title: 'API errors — Shared Memory',
  description:
    'Every machine error this API can return, with its HTTP status, stable code, and documentation page.',
}
const MEMBERS = [
  ['type', 'Documentation URL for this error, on the origin that answered.'],
  ['title', 'Short, stable summary of the error kind.'],
  ['status', 'The HTTP status code, repeated in the body.'],
  ['detail', 'What went wrong in this specific request.'],
  ['instance', 'Request path, without a query string.'],
  ['code', 'Stable machine identifier. Match on this, not on type.'],
  ['fields', 'Only on validation failures: rejected paths and their rules.'],
]
const EXAMPLE = {
  type: 'https://memory.ztd.me/errors/version-conflict',
  title: 'Version conflict',
  status: 409,
  detail: 'The memory changed. Read it again before editing.',
  instance: '/api/v1/memories/9f1c0f7e-4a1e-4a1e-9f1c-0f7e4a1e4a1e',
  code: 'VERSION_CONFLICT',
}

function ErrorTable(): React.JSX.Element {
  return (
    <div className="table-wrap overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {MEMBERS.map(([member, meaning]) => (
            <tr key={member}>
              <td>
                <code>{member}</code>
              </td>
              <td>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default function ErrorsIndex(): React.JSX.Element {
  return (
    <div className={PAGE_CLASS}>
      <p className={EYEBROW_CLASS}>RFC 9457 problem details</p>
      <h1>API errors</h1>
      <p className={MUTED_CLASS}>
        Every failure from this service is a problem document served as application/problem+json.
      </p>
      <ErrorTable />
      <h2>Catalog</h2>
      <div className="table-wrap overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Code</th>
              <th>Title</th>
              <th>Documentation</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_BY_STATUS.map(entry => (
              <tr key={entry.code}>
                <td>{entry.status}</td>
                <td>
                  <code>{entry.code}</code>
                </td>
                <td>{entry.title}</td>
                <td>
                  <a href={`/errors/${entry.slug}`}>
                    /errors/
                    {entry.slug}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className={CONNECTION_CARD_CLASS}>
        <h2>Example response</h2>
        <pre tabIndex={0} role="region" aria-label="Example response">
          {JSON.stringify(EXAMPLE, null, 2)}
        </pre>
        <p className={MUTED_CLASS_1}>
          The type prefix follows APP_ORIGIN, so a staging deployment documents its own origin
          while code stays identical everywhere.
        </p>
      </section>
      <p className={MUTED_CLASS_2}>
        <a className="inline-flex items-center gap-2" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Shared Memory
        </a>
      </p>
    </div>
  )
}
