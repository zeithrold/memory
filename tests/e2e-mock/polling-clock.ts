import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { z } from 'zod'

/** The catalog panel re-reads settings on this interval while a run is active. */
const POLL_DELAY_MS = 3000

const intervalSchema = z.object({ delay: z.number(), fires: z.number() })
const intervalsSchema = z.array(intervalSchema)
type IntervalRecord = z.infer<typeof intervalSchema>

async function pollingIntervals(page: Page): Promise<IntervalRecord[]> {
  const value = await page.evaluate((): unknown => Reflect.get(globalThis, '__memoryPollIntervals'))
  return intervalsSchema.parse(value)
}

/**
 * The catalog panel polls every 3s (`components/catalog-loader.ts`). Waiting for
 * that interval on the wall clock costs seconds per project, so browser tests
 * install a page-local clock (never a global fake), pause it, and record the
 * intervals the application itself registers. `installTestClock` must run before
 * navigation, because the polling interval is created when the catalog mounts.
 */
export async function installTestClock(page: Page): Promise<void> {
  await page.clock.install()
  // install() keeps time flowing; pause slightly ahead so the target cannot be a
  // moment that already passed, and so the interval boundary is exact.
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await page.addInitScript(() => {
    const store: { delay: number, fires: number }[] = []
    Reflect.set(globalThis, '__memoryPollIntervals', store)
    const native = window.setInterval.bind(window)
    Reflect.set(window, 'setInterval', (handler: TimerHandler, delay?: number, ...args: unknown[]): number => {
      const entry = { delay: Number(delay ?? 0), fires: 0 }
      store.push(entry)
      const wrapped = typeof handler === 'function'
        ? (...forwarded: unknown[]): void => {
            entry.fires += 1
            Reflect.apply(handler, undefined, forwarded)
          }
        : handler
      return native(wrapped, delay, ...args)
    })
  })
}

/**
 * Prove one polling period against the interval the product registered: its
 * callback must not run at `POLL_DELAY_MS - 1`, must run exactly once at the
 * boundary, and that run must reach the real mock route. Only timers are driven;
 * requests, responses and the render they cause stay real. Unrelated loader reads
 * cannot satisfy this, because the interval's own fire count is what is asserted.
 */
export async function expectPollingTick(page: Page, reads: () => number): Promise<void> {
  const polling = (await pollingIntervals(page)).filter(record => record.delay === POLL_DELAY_MS)
  if (polling.length !== 1) {
    throw new Error(`Expected one ${POLL_DELAY_MS}ms polling interval, found ${polling.length}.`)
  }
  await page.clock.runFor(POLL_DELAY_MS - 1)
  expect((await pollingIntervals(page)).find(record => record.delay === POLL_DELAY_MS)?.fires).toBe(0)
  const before = reads()
  await page.clock.runFor(1)
  const fired = async (): Promise<number | undefined> =>
    (await pollingIntervals(page)).find(record => record.delay === POLL_DELAY_MS)?.fires
  await expect.poll(fired).toBe(1)
  await expect.poll(reads).toBeGreaterThanOrEqual(before + 1)
}

/** Hand time back to the browser: motion, toasts and Axe keep real timers. */
export async function resumeTestClock(page: Page): Promise<void> {
  await page.clock.resume()
}
