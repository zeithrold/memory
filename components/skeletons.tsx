import { Skeleton } from './ui/skeleton'

const SKELETON_LINE_CLASS = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_LINE_CLASS_1 = ['skeleton-line skeleton-line-40 h-[11px] w-[40%]'].join(' ')

const SKELETON_LINE_CLASS_2 = ['skeleton-line skeleton-line-20 h-[11px] w-[20%]'].join(' ')

const SKELETON_LINE_CLASS_3 = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_LINE_CLASS_4 = ['skeleton-line skeleton-line-30 h-[11px] w-[30%]'].join(' ')

const SKELETON_LINE_CLASS_5 = ['skeleton-line skeleton-line-20 h-[11px] w-[20%]'].join(' ')

const SKELETON_LINE_CLASS_6 = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_LINE_CLASS_7 = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_LINE_CLASS_8 = ['skeleton-line skeleton-line-30 h-[11px] w-[30%]'].join(' ')

const SKELETON_LINE_CLASS_9 = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_LINE_CLASS_10 = ['skeleton-line skeleton-line-40 h-[11px] w-[40%]'].join(' ')

const SKELETON_LINE_CLASS_11 = ['skeleton-line skeleton-line-70 h-[11px] w-[70%]'].join(' ')

const SKELETON_PILL_CLASS = ['skeleton-pill skeleton-pill-sm h-5 rounded-full w-[30px]'].join(' ')

const DETAIL_CARD_CLASS = ['detail-card grid gap-5 p-6 bg-card border border-border rounded-[12px]'].join(' ')

const SKELETON_PILL_CLASS_1 = ['skeleton-pill skeleton-pill-sm h-5 rounded-full w-[30px]'].join(' ')

const MEMORY_CARD_CLASS = [
  'memory-card skeleton-card flex flex-col gap-4 p-6 bg-card border border-border rounded-[12px]',
  'shadow-[0_2px_4px_var(--card-shadow)] pointer-events-none wrap-anywhere',
].join(' ')

const CARD_META_CLASS = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const MEMORY_GRID_CLASS = [
  'memory-grid grid grid-cols-[repeat(auto-fit,_minmax(min(100%,_320px),_1fr))] gap-4 max-[640px]:gap-3',
].join(' ')

const PAGE_HEADING_CLASS = [
  'page-heading flex items-center justify-between gap-6 mb-8 max-[1000px]:items-start',
  'max-[1000px]:flex-col max-[1000px]:gap-2 flex-wrap wrap-anywhere',
].join(' ')

const CARD_META_CLASS_1 = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const REVISION_ITEM_CLASS = [
  'revision-item skeleton-card grid gap-3 p-5 bg-card border border-l-[3px] border-border rounded-md',
  '[&_h3]:m-0 [&_h3]:text-body [&_h3]:wrap-anywhere pointer-events-none',
].join(' ')

const CARD_META_CLASS_2 = [
  'card-meta flex items-center gap-2 text-help text-muted-foreground [&_time]:ml-auto wrap-anywhere',
].join(' ')

const TOKEN_ROW_CLASS = [
  'token-row skeleton-token-row py-5 px-0 border-b border-border flex items-center justify-between gap-3',
  'text-control [&_p]:text-muted-foreground [&_p]:wrap-anywhere [&_small]:text-muted-foreground',
  '[&_small]:wrap-anywhere [&_>_div]:flex-1',
].join(' ')

const STATS_CLASS = [
  'stats grid grid-cols-[repeat(3,_1fr)] gap-4 mb-6 [&_>_div]:bg-card [&_>_div]:border',
  '[&_>_div]:border-border [&_>_div]:p-6 [&_>_div]:rounded-md [&_span]:block [&_span]:text-control',
  '[&_span]:text-muted-foreground [&_strong]:block [&_strong]:mt-3 [&_strong]:font-medium',
  '[&_strong]:text-[length:32px] max-[640px]:gap-2 max-[640px]:[&_>_div]:py-4 max-[640px]:[&_>_div]:px-3',
  'max-[640px]:[&_span]:text-help max-[640px]:[&_strong]:text-[length:25px]',
  'max-[640px]:grid-cols-[minmax(0,_1fr)]',
].join(' ')

/** Mirrors `.memory-card` so the list does not jump when data arrives. */
function MemoryCardSkeleton() {
  return (
    <article className={MEMORY_CARD_CLASS}>
      <div className={CARD_META_CLASS}>
        <Skeleton className="skeleton-pill h-5 w-[62px] rounded-full" />
        <Skeleton className={SKELETON_PILL_CLASS} />
      </div>
      <Skeleton className="skeleton-title h-[18px] w-[62%]" />
      <div className="skeleton-stack grid gap-2">
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className={SKELETON_LINE_CLASS} />
      </div>
      <Skeleton className={SKELETON_LINE_CLASS_1} />
    </article>
  )
}
type MemoryGridSkeletonProps = { count?: number }

export function MemoryGridSkeleton({ count = 6 }: MemoryGridSkeletonProps): React.JSX.Element {
  return (
    <div
      className={MEMORY_GRID_CLASS}
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <MemoryCardSkeleton key={index} />
      ))}
    </div>
  )
}
/** Full-page placeholder for the first authenticated paint. */
export function PageSkeleton(): React.JSX.Element {
  return (
    <>
      <div className={PAGE_HEADING_CLASS}>
        <div className="skeleton-stack grid gap-2">
          <Skeleton className={SKELETON_LINE_CLASS_2} />
          <Skeleton className="skeleton-heading h-8 w-[46%]" />
          <Skeleton className={SKELETON_LINE_CLASS_3} />
        </div>
      </div>
      <MemoryGridSkeleton count={4} />
    </>
  )
}
export function MemoryDetailSkeleton(): React.JSX.Element {
  return (
    <article className={DETAIL_CARD_CLASS} role="status" aria-busy="true">
      <div className={CARD_META_CLASS_1}>
        <Skeleton className="skeleton-pill h-5 w-[62px] rounded-full" />
        <Skeleton className={SKELETON_PILL_CLASS_1} />
      </div>
      <Skeleton className="skeleton-heading h-8 w-[46%]" />
      <div className="skeleton-stack grid gap-2">
        <Skeleton className={SKELETON_LINE_CLASS_4} />
        <Skeleton className={SKELETON_LINE_CLASS_5} />
      </div>
      <div className="skeleton-stack grid gap-2">
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className={SKELETON_LINE_CLASS_6} />
      </div>
    </article>
  )
}
type RevisionListSkeletonProps = { count?: number }

export function RevisionListSkeleton(
  { count = 2 }: RevisionListSkeletonProps,
): React.JSX.Element {
  return (
    <div className="revision-list grid gap-3" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <article
          key={index}
          className={REVISION_ITEM_CLASS}
        >
          <div className={CARD_META_CLASS_2}>
            <Skeleton className="skeleton-pill h-5 w-[62px] rounded-full" />
          </div>
          <Skeleton className="skeleton-title h-[18px] w-[62%]" />
          <div className="skeleton-stack grid gap-2">
            <Skeleton className="skeleton-line h-[11px] w-full" />
            <Skeleton className={SKELETON_LINE_CLASS_7} />
          </div>
        </article>
      ))}
    </div>
  )
}
type TokenListSkeletonProps = { count?: number }

export function TokenListSkeleton({ count = 3 }: TokenListSkeletonProps): React.JSX.Element {
  return (
    <div className="token-list" role="status" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={TOKEN_ROW_CLASS}
        >
          <div className="skeleton-stack grid gap-2">
            <Skeleton className={SKELETON_LINE_CLASS_8} />
            <Skeleton className={SKELETON_LINE_CLASS_9} />
            <Skeleton className={SKELETON_LINE_CLASS_10} />
          </div>
        </div>
      ))}
    </div>
  )
}
export function UsageSkeleton(): React.JSX.Element {
  return (
    <div role="status" aria-busy="true">
      <div className={STATS_CLASS}>
        <Skeleton className="skeleton-tile h-27 w-full rounded-md" />
        <Skeleton className="skeleton-tile h-27 w-full rounded-md" />
        <Skeleton className="skeleton-tile h-27 w-full rounded-md" />
      </div>
      <div className="skeleton-stack grid gap-2">
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className="skeleton-line h-[11px] w-full" />
        <Skeleton className={SKELETON_LINE_CLASS_11} />
      </div>
    </div>
  )
}
