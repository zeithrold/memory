import { Skeleton } from './ui/skeleton'

/** Mirrors `.memory-card` so the list does not jump when data arrives. */
function MemoryCardSkeleton() {
  return (
    <article className="memory-card skeleton-card">
      <div className="card-meta">
        <Skeleton className="skeleton-pill" />
        <Skeleton className="skeleton-pill skeleton-pill-sm" />
      </div>
      <Skeleton className="skeleton-title" />
      <div className="skeleton-stack">
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line skeleton-line-70" />
      </div>
      <Skeleton className="skeleton-line skeleton-line-40" />
    </article>
  )
}
export function MemoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="memory-grid" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <MemoryCardSkeleton key={index} />
      ))}
    </div>
  )
}
/** Full-page placeholder for the first authenticated paint. */
export function PageSkeleton() {
  return (
    <>
      <div className="page-heading">
        <div className="skeleton-stack">
          <Skeleton className="skeleton-line skeleton-line-20" />
          <Skeleton className="skeleton-heading" />
          <Skeleton className="skeleton-line skeleton-line-70" />
        </div>
      </div>
      <MemoryGridSkeleton count={4} />
    </>
  )
}
export function MemoryDetailSkeleton() {
  return (
    <article className="detail-card" role="status" aria-busy="true">
      <div className="card-meta">
        <Skeleton className="skeleton-pill" />
        <Skeleton className="skeleton-pill skeleton-pill-sm" />
      </div>
      <Skeleton className="skeleton-heading" />
      <div className="skeleton-stack">
        <Skeleton className="skeleton-line skeleton-line-30" />
        <Skeleton className="skeleton-line skeleton-line-20" />
      </div>
      <div className="skeleton-stack">
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line skeleton-line-70" />
      </div>
    </article>
  )
}
export function RevisionListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="revision-list" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <article key={index} className="revision-item skeleton-card">
          <div className="card-meta">
            <Skeleton className="skeleton-pill" />
          </div>
          <Skeleton className="skeleton-title" />
          <div className="skeleton-stack">
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line skeleton-line-70" />
          </div>
        </article>
      ))}
    </div>
  )
}
export function TokenListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="token-list" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="token-row skeleton-token-row">
          <div className="skeleton-stack">
            <Skeleton className="skeleton-line skeleton-line-30" />
            <Skeleton className="skeleton-line skeleton-line-70" />
            <Skeleton className="skeleton-line skeleton-line-40" />
          </div>
        </div>
      ))}
    </div>
  )
}
export function UsageSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <div className="stats">
        <Skeleton className="skeleton-tile" />
        <Skeleton className="skeleton-tile" />
        <Skeleton className="skeleton-tile" />
      </div>
      <div className="skeleton-stack">
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line skeleton-line-70" />
      </div>
    </div>
  )
}
