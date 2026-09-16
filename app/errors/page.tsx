import type { Metadata } from 'next'
import { ERROR_BY_STATUS } from '@/lib/error-catalog'

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
export default function ErrorsIndex() {
  return (
    <main className="page">
      <p className="eyebrow">RFC 9457 problem details</p>
      <h1>API errors</h1>
      <p className="muted">Every failure from this service is a problem document served as application/problem+json.</p>
      <div className="table-wrap">
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
      <h2>Catalog</h2>
      <div className="table-wrap">
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
      <section className="connection-card">
        <h2>Example response</h2>
        <pre>{JSON.stringify(EXAMPLE, null, 2)}</pre>
        <p className="muted">The type prefix follows APP_ORIGIN, so a staging deployment documents its own origin while code stays identical everywhere.</p>
      </section>
      <p className="muted">
        <a href="/">← Shared Memory</a>
      </p>
    </main>
  )
}
