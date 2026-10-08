const MUTED_CLASS = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')

const MUTED_CLASS_1 = ['muted text-muted-foreground text-control leading-[1.9]'].join(' ')
const EYEBROW_CLASS = ['eyebrow text-help tracking-[2px] uppercase text-primary font-[650]'].join(' ')
const PAGE_CLASS = [
  'page max-w-328 m-auto pt-10 px-12 pb-12 max-[1000px]:py-8 max-[1000px]:px-6 max-[640px]:py-6',
  'max-[640px]:px-4',
].join(' ')
export function NotFoundContent(): React.JSX.Element {
  return (
    <div className={PAGE_CLASS}>
      <p className={EYEBROW_CLASS}>404</p>
      <h1>Not found</h1>
      <p className={MUTED_CLASS}>
        That path does not exist. API failures are documented one page per error code, and
        the catalog lists every one of them.
      </p>
      <p className={MUTED_CLASS_1}>
        <a href="/errors">Browse API errors</a>
        {' · '}
        <a href="/">Shared Memory</a>
      </p>
    </div>
  )
}
