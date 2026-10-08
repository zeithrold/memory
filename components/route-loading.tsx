import { PageSkeleton } from './skeletons'

const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')

export default function RouteLoading(): React.JSX.Element {
  return (
    <div className={PAGE_CLASS}>
      <PageSkeleton />
    </div>
  )
}
