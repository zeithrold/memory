export default function NotFound() {
  return (
    <main className="page">
      <p className="eyebrow">404</p>
      <h1>Not found</h1>
      <p className="muted">That path does not exist. API failures are documented one page per error code, and the catalog lists every one of them.</p>
      <p className="muted">
        <a href="/errors">Browse API errors</a>
        {' · '}
        <a href="/">Shared Memory</a>
      </p>
    </main>
  )
}
